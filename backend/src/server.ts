import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import {
  QueryRequest,
  QueryResponse,
  UploadResponse,
  Document,
  ComparisonRequest,
  ComparisonResponse
} from '../../shared/types';
import { createPoisonedDocument } from '../../shared/attacks';
import { SEED_DEFENSES } from '../../shared/defenses';
import { HARDENED_SYSTEM_PROMPT } from '../../shared/constants';
import { attackService } from './services/attack.service';
import { runDefensePipeline } from './services/defense/defense-pipeline.service';

import { createLLMService, LLMService, type LLMConfig } from './services/llm.service';
import { llmFactory } from './services/llm/llm-factory';
import { documentService } from './services/document.service';
import testingRouter from './controllers/testing.controller';
import jobsRouter from './controllers/jobs.controller';
import { stopKeepAlive, closePool } from './config/database';
import { runMigrations, seedDefaultAccounts, seedAttacks, seedDefenses } from './db/migrate';
import authRouter, { authenticateToken, requireAdmin } from './auth';
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/better-auth";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
app.disable('x-powered-by');

// Initialize LLM services
const llmService = createLLMService();
const JUDGE_COST_PER_1K_TOKENS_USD = Number(process.env.JUDGE_COST_PER_1K_TOKENS_USD || '0');

// Qwen 3 235B judge for simulation/comparison (same as stress-test eval)
let _simJudgeLLM: LLMService | null = null;
function getSimulationJudgeLLM(): LLMService {
  if (_simJudgeLLM) return _simJudgeLLM;
  const config: LLMConfig = {
    apiKey:    process.env.CEREBRAS_API_KEY || '',
    model:     'qwen-3-235b-a22b-instruct-2507',
    baseUrl:   process.env.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1',
    maxTokens: 512,
  };
  _simJudgeLLM = new LLMService(config);
  return _simJudgeLLM;
}



// ─── Global middleware ────────────────────────────────────────────────────────

const corsOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

// Ensure local dev ports are always permitted alongside Doppler variables
const defaultLocalOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3001',
  'http://127.0.0.1:3001'
];

const allowedOriginSet = new Set([...corsOrigins, ...defaultLocalOrigins]);

app.use(helmet());
app.use(cookieParser());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOriginSet.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 1000), // Raised ceiling
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth requests, please try again later' },
});

const llmLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.LLM_RATE_LIMIT_MAX ?? 120),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down' },
});

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.txt') {
      cb(new Error('Only .txt files are allowed'));
      return;
    }
    cb(null, true);
  },
});

// ─── Public routes (no auth required) ────────────────────────────────────────

import { runMigrations } from './db/migrate';

app.get('/api/run-migrations', async (req, res) => {
  try {
    await runMigrations();
    res.send('Migrations executed successfully');
  } catch (err) {
    res.status(500).send(String(err));
  }
});

// Admin auth endpoints (custom)
app.use('/api/auth', authRouter);

// Auth endpoints (handled by Better Auth)
app.all("/api/auth/*", (req, res, next) => {
  // Fix for Vite Proxy: Better Auth CSRF fails because Host changes to 127.0.0.1:3001
  // We spoof the Origin and Host to match the baseURL so Better Auth trusts the proxied request.
  req.headers.origin = "http://localhost:3001";
  req.headers.host = "localhost:3001";
  delete req.headers["x-forwarded-host"];
  delete req.headers["x-forwarded-proto"];
  delete req.headers["x-forwarded-for"];
  next();
}, toNodeHandler(auth));

// Health check — stays public for uptime monitoring
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    llmConfigured: !!process.env.CEREBRAS_API_KEY,
    timestamp: new Date().toISOString()
  });
});

function requirePrompt(req: Request, res: Response): boolean {
  if (typeof req.body?.prompt !== 'string' || req.body.prompt.trim().length === 0) {
    res.status(400).json({ error: 'Prompt is required' });
    return false;
  }
  return true;
}

// ─── Protected routes (JWT required for everything below) ────────────────────

app.use('/api', authenticateToken);

// ─── Documents (authenticated users) ─────────────────────────────────────────

app.get('/api/documents', (req: Request, res: Response) => {
  const documents = documentService.getAllDocuments();
  const stats = documentService.getDocumentStats();
  res.json({ documents, stats });
});

app.post('/api/documents/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const content = req.file.buffer.toString('utf-8');
    const applySanitization = req.body.applySanitization === 'true';

    const result = documentService.sanitizeAndAddDocument(
      req.file.originalname,
      content,
      applySanitization
    );

    const response: UploadResponse = {
      document: result.document,
    };

    res.json(response);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

app.delete('/api/documents/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const deleted = documentService.deleteDocument(id);

  if (deleted) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Document not found' });
  }
});

app.delete('/api/documents', (req: Request, res: Response) => {
  documentService.clearAllDocuments();
  res.json({ success: true });
});

// ─── Attacks (admin only) ─────────────────────────────────────────────────────

app.get('/api/attacks', requireAdmin, async (req: Request, res: Response) => {
  try {
    const attacks = await attackService.getAllAttacks();
    res.json(attacks);
  } catch (error) {
    console.error('Error fetching attacks:', error);
    res.status(500).json({ error: 'Failed to fetch attacks' });
  }
});

app.post('/api/attacks', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, description, injectionText, category, tier, howItWorks, mechanism, impact, example } = req.body;

    if (!name || !description || !injectionText || !category || !tier) {
      return res.status(400).json({ error: 'name, description, injectionText, category, and tier are required' });
    }

    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const userId = (req as any).user?.userId;

    const attack = await attackService.createAttack({
      id,
      name,
      description,
      injectionText,
      category,
      tier,
      howItWorks,
      mechanism,
      impact,
      example,
      createdBy: userId,
    });

    res.status(201).json(attack);
  } catch (error: any) {
    if (error?.code === '23505') { // unique constraint violation
      return res.status(409).json({ error: 'An attack with this name already exists' });
    }
    console.error('Error creating attack:', error);
    res.status(500).json({ error: 'Failed to create attack' });
  }
});

app.delete('/api/attacks/:attackId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { attackId } = req.params;
    const deleted = await attackService.deleteAttack(attackId);

    if (!deleted) {
      return res.status(404).json({ error: 'Attack not found or is a built-in attack' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting attack:', error);
    res.status(500).json({ error: 'Failed to delete attack' });
  }
});

// In-memory defense enabled state (initialized from SEED_DEFENSES)
const defenseEnabledState: Record<string, boolean> = {};
for (const d of SEED_DEFENSES) {
  defenseEnabledState[d.id] = d.enabled;
}

app.get('/api/defenses', (req: Request, res: Response) => {
  const defenses = SEED_DEFENSES.map(d => ({
    ...d,
    enabled: defenseEnabledState[d.id] ?? d.enabled,
  }));
  res.json(defenses);
});

app.patch('/api/defenses/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const defense = SEED_DEFENSES.find(d => d.id === id);
  if (!defense) {
    return res.status(404).json({ error: 'Defense not found' });
  }
  const currentEnabled = defenseEnabledState[id] ?? defense.enabled;
  defenseEnabledState[id] = !currentEnabled;
  res.json({ ...defense, enabled: defenseEnabledState[id] });
});

// ─── Query (authenticated users) ─────────────────────────────────────────────

app.post('/api/query', llmLimiter, async (req: Request, res: Response) => {
  try {
    if (!requirePrompt(req, res)) return;
    const { prompt, documentIds, activeDefenses }: QueryRequest = req.body;
    const safeDocumentIds = Array.isArray(documentIds) ? documentIds : [];
    const safeActiveDefenses = Array.isArray(activeDefenses) ? activeDefenses : [];

    const documents = documentService.getDocumentsByIds(safeDocumentIds);
    const documentContext = documents
      .map(doc => `=== Document: ${doc.name} ===\n\n${doc.content}\n\n`)
      .join('');

    const fullContext = documentContext + prompt;
    const { withinLimit, estimatedTokens } = llmService.checkContextLimit(fullContext);

    if (!withinLimit) {
      return res.status(400).json({
        error: 'Context exceeds token limit',
        estimatedTokens,
        maxTokens: llmService['config'].maxTokens,
      });
    }

    // Session ID for turn tracking (use JWT userId if available)
    const sessionId = (req as any).user?.userId || 'anonymous';

    if (safeActiveDefenses.length > 0) {
      // Run through defense pipeline
      const pipelineResult = await runDefensePipeline({
        userQuery: prompt,
        documentContext,
        activeDefenses: safeActiveDefenses,
        sessionId,
        primaryLlmCall: async (p: string, ctx?: string) => {
          const systemPrompt = HARDENED_SYSTEM_PROMPT;
          const result = await llmService.queryWithContext(p, ctx || '', systemPrompt);
          return result.content;
        },
        judgeLlmCall: async (p: string) => {
          const judgeLLM = getSimulationJudgeLLM();
          return judgeLLM.queryWithContext(p, '', undefined);
        },
        judgeCostPer1kTokensUsd: Number.isFinite(JUDGE_COST_PER_1K_TOKENS_USD) ? JUDGE_COST_PER_1K_TOKENS_USD : 0,
      });

      const queryResponse: QueryResponse = {
        response: pipelineResult.allowed
          ? (pipelineResult.modifiedResponse || '')
          : pipelineResult.summary,
        defenseState: {
          activeDefenses: safeActiveDefenses,
          pipelineResult: {
            allowed: pipelineResult.allowed,
            verdicts: pipelineResult.verdicts,
            summary: pipelineResult.summary,
            defenseEconomics: pipelineResult.defenseEconomics,
          },
          flagged: !pipelineResult.allowed,
        },
        truncated: !withinLimit,
      };

      return res.json(queryResponse);
    }

    // No defenses active — direct LLM call
    const systemPrompt = HARDENED_SYSTEM_PROMPT;
    const llmResponse = await llmService.queryWithContext(prompt, documentContext, systemPrompt);

    const queryResponse: QueryResponse = {
      response: llmResponse.content,
      defenseState: { activeDefenses: [] },
      truncated: !withinLimit,
      tokenCount: llmResponse.tokenCount,
    };

    res.json(queryResponse);
  } catch (error) {
    console.error('Query error:', error);
    res.status(500).json({
      error: 'Failed to process query',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.post('/api/llm-compare', requireAdmin, llmLimiter, async (req: Request, res: Response) => {
  try {
    if (typeof req.body?.prompt !== 'string' || req.body.prompt.trim().length === 0) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const requestedProviders = Array.isArray(req.body?.providers)
      ? req.body.providers.filter((provider: unknown): provider is string => typeof provider === 'string' && provider.trim().length > 0)
      : [];

    if (requestedProviders.length === 0) {
      return res.status(400).json({ error: 'At least one provider is required' });
    }

    const results = await Promise.all(requestedProviders.map(async (provider: string) => {
      const startedAt = Date.now();

      try {
        const llm = llmFactory.getLLM(provider);
        if (!llm.isConfigured) {
          return {
            provider,
            success: false,
            response: '',
            executionTimeMs: Date.now() - startedAt,
            error: `${provider} is not configured`,
          };
        }

        const result = await llm.query(req.body.prompt, {
          systemPrompt: HARDENED_SYSTEM_PROMPT,
          temperature: 0.7,
        });

        return {
          provider,
          success: true,
          response: result.content,
          executionTimeMs: Date.now() - startedAt,
          tokenCount: result.tokenCount,
        };
      } catch (error) {
        return {
          provider,
          success: false,
          response: '',
          executionTimeMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }));

    return res.json({ results });
  } catch (error) {
    console.error('LLM compare error:', error);
    return res.status(500).json({ error: 'Failed to compare providers' });
  }
});

// ─── Comparison (authenticated users) ────────────────────────────────────────

app.post('/api/comparison', llmLimiter, async (req: Request, res: Response) => {
  try {
    if (!requirePrompt(req, res)) return;
    const { prompt, documentIds, attackIds = [], defenseIds = [] }: ComparisonRequest = req.body as any;
    const safeDocumentIds = Array.isArray(documentIds) ? documentIds : [];
    const safeDefenseIds = Array.isArray(defenseIds) ? defenseIds : [];
    const baseDocuments = documentService.getDocumentsByIds(safeDocumentIds);
    const sessionId = (req as any).user?.userId || 'anonymous';

    const runQuery = async (
      docs: Document[],
      activeDefenses: string[]
    ): Promise<QueryResponse> => {
      const documentContext = docs
        .map(doc => `=== Document: ${doc.name} ===\n\n${doc.content}\n\n`)
        .join('');

      if (activeDefenses.length > 0) {
        const pipelineResult = await runDefensePipeline({
          userQuery: prompt,
          documentContext,
          activeDefenses,
          sessionId: `${sessionId}-comparison`,
          primaryLlmCall: async (p: string, ctx?: string) => {
            const sysPrompt = HARDENED_SYSTEM_PROMPT;
            const result = await llmService.queryWithContext(p, ctx || '', sysPrompt);
            return result.content;
          },
          judgeLlmCall: async (p: string) => {
            const judgeLLM = getSimulationJudgeLLM();
          return judgeLLM.queryWithContext(p, '', undefined);
          },
        judgeCostPer1kTokensUsd: Number.isFinite(JUDGE_COST_PER_1K_TOKENS_USD) ? JUDGE_COST_PER_1K_TOKENS_USD : 0,
        });

        return {
          response: pipelineResult.allowed
            ? (pipelineResult.modifiedResponse || '')
            : pipelineResult.summary,
          defenseState: {
            activeDefenses,
            pipelineResult: {
              allowed: pipelineResult.allowed,
              verdicts: pipelineResult.verdicts,
              summary: pipelineResult.summary,
            defenseEconomics: pipelineResult.defenseEconomics,
            },
            flagged: !pipelineResult.allowed,
          },
          truncated: false,
        };
      }

      // No defenses — direct LLM call
      const sysPrompt = HARDENED_SYSTEM_PROMPT;
      const llmResponse = await llmService.queryWithContext(prompt, documentContext, sysPrompt);

      return {
        response: llmResponse.content,
        defenseState: { activeDefenses: [] },
        truncated: false,
        tokenCount: llmResponse.tokenCount,
      };
    };

    const calls: Promise<QueryResponse>[] = [
      runQuery(baseDocuments, []),
    ];

    let attackDocs: Document[] = [];

    if (attackIds && attackIds.length > 0) {
      for (const aId of attackIds) {
        const attack = await attackService.getAttackById(aId);
        if (attack) {
          const poisonedContent = createPoisonedDocument(attack);
          attackDocs.push({
            id: `temp_${Date.now()}_${aId}`,
            name: `poisoned_${attack.name.replace(/\s+/g, '_')}.txt`,
            content: poisonedContent,
            uploadedAt: new Date(),
            isPoisoned: true,
            attackType: attack.id,
          });
        }
      }

      if (attackDocs.length > 0) {
        calls.push(runQuery([...baseDocuments, ...attackDocs], []));
        if (safeDefenseIds.length > 0) {
          calls.push(runQuery([...baseDocuments, ...attackDocs], safeDefenseIds));
        }
      }
    }

    const results = await Promise.all(calls);

    const comparisonResponse: ComparisonResponse = {
      clean: results[0],
      attacked: results[1],
      defended: results[2],
    };

    res.json(comparisonResponse);
  } catch (error) {
    console.error('Comparison error:', error);
    res.status(500).json({
      error: 'Failed to run comparison',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ─── Testing & Analytics (Admin Only) ────────────────────────────────────────
app.use('/api', requireAdmin, jobsRouter);
app.use('/api', requireAdmin, testingRouter);

// ─── Server startup ───────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 LLM API configured: ${!!process.env.CEREBRAS_API_KEY}`);
  console.log(`🤖 Model: ${process.env.LLM_MODEL || 'llama3.1-8b'}\n`);

  // Run DB migrations automatically on startup when a DB is configured
  if (process.env.DATABASE_URL && process.env.DATABASE_URL !== 'your_neon_database_url_here') {
    try {
      await runMigrations();
      await seedDefaultAccounts();
      await seedAttacks();
      await seedDefenses();
    } catch (err) {
      console.error('⚠ Migration failed — server will continue but auth may not work:', err);
    }
  }
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

const shutdown = async (signal: string) => {
  console.log(`\n${signal} received — shutting down gracefully...`);
  stopKeepAlive();
  await closePool();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default app;
