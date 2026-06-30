import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import {
  QueryRequest,
  QueryResponse,
  UploadResponse,
  Document,
  Attack,
  SimulatorRequest,
  SimulatorResponse,
} from '../../shared/types';
import { createPoisonedDocument } from '../../shared/attacks';
import { SEED_DEFENSES } from '../../shared/defenses';
import { HARDENED_SYSTEM_PROMPT, DEFAULT_LLM_MODEL } from '../../shared/constants';
import {
  buildBreachSimulationSystemPrompt,
  buildSimulatorAllowedAppendix,
  buildSimulatorBlockedSummary,
} from '../../shared/simulation-prompts';
import { attackService } from './services/attack.service';
import { runDefensePipeline } from './services/defense/defense-pipeline.service';

import { createLLMService, LLMService, type LLMConfig } from './services/llm.service';
import { documentService } from './services/document.service';
import testingRouter from './controllers/testing.controller';
import jobsRouter from './controllers/jobs.controller';
import { stopKeepAlive, closePool } from './config/database';
import { runMigrations, seedDefaultAccounts, backfillCredentialAccounts, seedAttacks, seedDefenses, cleanupExpiredDeletedAccounts } from './db/migrate';
import { deleteExpiredSessions } from './lib/session-cleanup';
import authRouter, { authenticateToken, requireAdmin, type AuthenticatedRequest } from './auth';
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import { auth } from "./lib/better-auth";
import { writeAuditLog } from './lib/audit';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
app.disable('x-powered-by');

// Initialize LLM services
const llmService = createLLMService();
const JUDGE_COST_PER_1K_TOKENS_USD = Number(process.env.JUDGE_COST_PER_1K_TOKENS_USD || '0');

// Qwen 3 235B judge for simulation (same as stress-test eval)
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

const jsonParser = express.json({ limit: '10mb' });
const urlencodedParser = express.urlencoded({ extended: true, limit: '10mb' });

/**
 * Blocklist: Better Auth paths that must NOT be pre-parsed by express.json/urlencoded.
 * New custom routes in auth.ts do not belong here — they receive JSON parsing automatically.
 *
 * Skip express.json / urlencoded for Better Auth's own HTTP API only so `toNodeHandler`
 * receives the raw body (see https://www.better-auth.com/docs/integrations/express).
 *
 * Paths skipped here (stable Better Auth surface — extend if the framework adds routes):
 *   GET  /api/auth/ok
 *   GET  /api/auth/get-session
 *   POST /api/auth/sign-out
 *   Prefixes: /api/auth/sign-in/, /api/auth/sign-up/, /api/auth/callback/,
 *              /api/auth/session/, /api/auth/oauth2/, /api/auth/forget-password/,
 *              /api/auth/verify-email/, /api/auth/link/, /api/auth/unlink/
 *
 * Any other `/api/auth/*` route (including custom routes in auth.ts) receives normal
 * global body parsing by default.
 */
function shouldSkipBodyParserForBetterAuth(req: Request): boolean {
  const p = req.path;
  if (!p.startsWith('/api/auth')) return false;

  if (p === '/api/auth/ok' || p === '/api/auth/get-session' || p === '/api/auth/sign-out') {
    return true;
  }

  const skipPrefixes = [
    '/api/auth/sign-in',
    '/api/auth/sign-up',
    '/api/auth/callback',
    '/api/auth/oauth2',
    '/api/auth/session',
    '/api/auth/forget-password',
    '/api/auth/verify-email',
    '/api/auth/link',
    '/api/auth/unlink',
  ];
  for (const pre of skipPrefixes) {
    if (p === pre || p.startsWith(`${pre}/`)) return true;
  }

  return false;
}

app.use((req, res, next) => {
  if (shouldSkipBodyParserForBetterAuth(req)) {
    return next();
  }
  jsonParser(req, res, (err) => {
    if (err) return next(err);
    urlencodedParser(req, res, next);
  });
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(
    process.env.AUTH_RATE_LIMIT_MAX ??
      (process.env.NODE_ENV === 'production' ? 120 : 600),
  ),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth requests, please try again later' },
  skip: () => process.env.AUTH_RATE_LIMIT_DISABLED === '1',
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
  fileFilter: (_req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.txt') {
      cb(new Error('Only .txt files are allowed'));
      return;
    }
    cb(null, true);
  },
});

// ─── Public routes (no auth required) ────────────────────────────────────────

app.get('/api/run-migrations', (_req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  next();
}, async (_req, res) => {
  try {
    await runMigrations();
    res.send('Migrations executed successfully');
  } catch (err) {
    res.status(500).send(String(err));
  }
});

// Auth rate limit: apply once for all /api/auth traffic (custom routes + Better Auth).
// Do not stack limiters on both `authRouter` and the Better Auth catch-all — that doubled
// counts for get-session/sign-in and exhausted the budget quickly on localhost.
app.use('/api/auth', authLimiter);
app.use('/api/auth', authRouter);

// Auth endpoints (handled by Better Auth)
app.all("/api/auth/*", async (req, res, next) => {
  // ── Logout audit: capture the session before Better Auth deletes it ──
  if (req.method === 'POST' && req.path === '/api/auth/sign-out') {
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });
      if (session) {
        // Write audit log after the response finishes (non-blocking)
        res.on('finish', () => {
          writeAuditLog({
            actorUserId: session.user.id,
            action: 'auth.logout',
            entityType: 'session',
            outcome: 'success',
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            metadata: { email: session.user.email },
          }).catch(err => console.error('Audit log error (logout):', err));
        });
      }
    } catch {
      // Session lookup failed — continue anyway; the sign-out should still proceed.
    }
  }

  // In development, spoof Origin/Host to match baseURL so Better Auth trusts
  // requests proxied through Vite. Never applied in production.
  if (process.env.NODE_ENV !== 'production') {
    const baseUrl = process.env.BETTER_AUTH_URL || "http://localhost:3001";
    req.headers.origin = baseUrl;
    req.headers.host = new URL(baseUrl).host;
    delete req.headers["x-forwarded-host"];
    delete req.headers["x-forwarded-proto"];
    delete req.headers["x-forwarded-for"];
  }
  next();
}, toNodeHandler(auth));

// Health check — stays public for uptime monitoring
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    llmConfigured: !!process.env.CEREBRAS_API_KEY,
    timestamp: new Date().toISOString(),
    model: process.env.LLM_MODEL || DEFAULT_LLM_MODEL,
  });
});

function requirePrompt(req: Request, res: Response): boolean {
  if (typeof req.body?.prompt !== 'string' || req.body.prompt.trim().length === 0) {
    res.status(400).json({ error: 'Prompt is required' });
    return false;
  }
  return true;
}

function authUserId(req: Request): string {
  return (req as AuthenticatedRequest).user!.userId;
}

// ─── Protected routes (JWT required for everything below) ────────────────────

app.use('/api', authenticateToken);

// ─── Documents (authenticated users) ─────────────────────────────────────────

app.get('/api/documents', (req: Request, res: Response) => {
  const userId = authUserId(req);
  const documents = documentService.getAllDocuments(userId);
  const stats = documentService.getDocumentStats(userId);
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
      authUserId(req),
      req.file.originalname,
      content,
      applySanitization
    );

    const response: UploadResponse = {
      document: result.document,
      scanResult: result.scanResult,
    };

    res.json(response);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

app.delete('/api/documents/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const deleted = documentService.deleteDocument(authUserId(req), id);

  if (deleted) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Document not found' });
  }
});

app.delete('/api/documents', (req: Request, res: Response) => {
  documentService.clearAllDocuments(authUserId(req));
  res.json({ success: true });
});

// InfoBank one-click load — reads a fixture file from disk into the in-memory document service
app.post('/api/documents/load-infobank', async (req, res) => {
  try {
    const { filename, folder } = req.body as { filename?: string; folder?: string };

    if (!filename || !folder) {
      return res.status(400).json({ error: 'filename and folder are required' });
    }

    // Validate folder is only clean or poisoned — never allow arbitrary path traversal
    if (folder !== 'clean' && folder !== 'poisoned') {
      return res.status(400).json({ error: 'folder must be clean or poisoned' });
    }

    // Sanitize filename — strip any path separators to prevent directory traversal
    const safeName = path.basename(filename);
    if (!safeName.endsWith('.txt')) {
      return res.status(400).json({ error: 'Only .txt files are permitted' });
    }

    // Walk up from __dirname to find the repo root regardless of whether we are running
    // via tsx (backend/src/) or from the compiled output (backend/dist/backend/src/).
    let repoRoot: string | null = null;
    {
      let dir = __dirname;
      for (let i = 0; i < 8; i++) {
        if (fs.existsSync(path.join(dir, 'InfoBank'))) {
          repoRoot = dir;
          break;
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    }
    if (!repoRoot) {
      return res.status(500).json({ error: 'Could not locate InfoBank directory on server' });
    }

    const filePath = path.join(repoRoot, 'InfoBank', folder, safeName);

    // Confirm the resolved path is inside InfoBank — belt-and-suspenders traversal check
    const infoBankRoot = path.join(repoRoot, 'InfoBank');
    if (!filePath.startsWith(infoBankRoot + path.sep) && filePath !== infoBankRoot) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `File not found: InfoBank/${folder}/${safeName}` });
    }

    const content = fs.readFileSync(filePath, 'utf-8');

    if (content.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'File exceeds 5 MB limit' });
    }

    // Poisoned InfoBank fixtures are marked isPoisoned so the simulator can
    // keep them out of the clean baseline; defenses still run at query time.
    const document = documentService.addDocument(authUserId(req), safeName, content, folder === 'poisoned');

    return res.status(200).json({ success: true, document });
  } catch (err) {
    console.error('[load-infobank] Error:', err);
    return res.status(500).json({ error: 'Failed to load InfoBank document' });
  }
});

// ─── Attacks (admin only) ─────────────────────────────────────────────────────

app.get('/api/attacks', requireAdmin, async (_req: Request, res: Response) => {
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

app.get('/api/defenses', (_req: Request, res: Response) => {
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

    const documents = documentService.getDocumentsByIds(authUserId(req), safeDocumentIds);
    const systemPrompt = HARDENED_SYSTEM_PROMPT;

    const attachedDocs = documents.map((d) => ({ name: d.name, content: d.content }));
    let chatContext = '';
    for (const doc of attachedDocs) {
      chatContext += `\n\n--- [ATTACHED] ${doc.name} ---\n${doc.content}`;
    }
    const chatWasTruncated = false;

    const sessionId = (req as any).user?.userId || 'anonymous';

    if (safeActiveDefenses.length > 0) {
      const pipelineResult = await runDefensePipeline({
        userQuery: prompt,
        documentContext: chatContext,
        activeDefenses: safeActiveDefenses,
        sessionId,
        primaryLlmCall: async (p: string, ctx?: string) => {
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
            forcedJudgeActive: pipelineResult.forcedJudgeActive === true,
          },
          flagged: !pipelineResult.allowed,
        },
        truncated: chatWasTruncated,
        wasTruncated: chatWasTruncated,
      };

      return res.json(queryResponse);
    }

    const llmResponse = await llmService.queryWithContext(prompt, chatContext, systemPrompt);

    const queryResponse: QueryResponse = {
      response: llmResponse.content,
      defenseState: { activeDefenses: [] },
      truncated: chatWasTruncated,
      wasTruncated: chatWasTruncated,
      tokenCount: llmResponse.tokenCount,
    };

    res.json(queryResponse);
  } catch (error) {
    const err: any = error;
    if (
      err?.response?.data?.code === 'context_length_exceeded' ||
      err?.message?.includes('context_length_exceeded') ||
      (err?.response?.status === 400 && err?.response?.data?.type === 'invalid_request_error')
    ) {
      return res.status(400).json({
        error: 'context_overflow',
        message: 'The selected configuration exceeds the model context window (8,192 tokens).',
        suggestion: 'Reduce attack vectors to 4 or fewer, or remove attached documents and retry.',
      });
    }
    console.error('Query error:', error);
    res.status(500).json({
      error: 'Failed to process query',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});


// ─── Simulator (authenticated users) ───────────────────────────────────────────

app.post('/api/simulator', llmLimiter, async (req: Request, res: Response) => {
  try {
    if (!requirePrompt(req, res)) return;
    const { prompt, documentIds, attackIds = [], defenseIds = [] }: SimulatorRequest = req.body as any;
    const safeDocumentIds = Array.isArray(documentIds) ? documentIds : [];
    const safeDefenseIds = Array.isArray(defenseIds) ? defenseIds : [];
    const sessionId = (req as any).user?.userId || 'anonymous';

    const allResolvedDocs = documentService.getDocumentsByIds(authUserId(req), safeDocumentIds);
    const cleanContextDocs = allResolvedDocs.filter((d) => !d.isPoisoned && !d.untrustedUpload);

    const loadedAttacks: Attack[] = [];
    if (attackIds && attackIds.length > 0) {
      for (const aId of attackIds) {
        const attack = await attackService.getAttackById(aId);
        if (attack) loadedAttacks.push(attack);
      }
    }

    type SimulatorQueryMeta = {
      breachAttacks?: Attack[];
      useBreachLaneSystemPrompt?: boolean;
      simulationExplainer?: { attacks: Attack[] };
    };

    const runQuery = async (
      userTask: string,
      sharedContext: string,
      activeDefenses: string[],
      meta?: SimulatorQueryMeta,
    ): Promise<QueryResponse> => {
      const documentContext = sharedContext;

      if (activeDefenses.length > 0) {
        const pipelineResult = await runDefensePipeline({
          userQuery: userTask,
          documentContext,
          activeDefenses,
          sessionId: `${sessionId}-simulator`,
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

        const explainer = meta?.simulationExplainer;
        let responseText = pipelineResult.allowed
          ? (pipelineResult.modifiedResponse || '')
          : pipelineResult.summary;
        let summaryText = pipelineResult.summary;

        if (explainer) {
          if (pipelineResult.allowed) {
            responseText =
              (pipelineResult.modifiedResponse || '') +
              buildSimulatorAllowedAppendix(
                pipelineResult.verdicts,
                activeDefenses,
                explainer.attacks,
                userTask,
              );
            summaryText =
              'Answer allowed under active defenses — see simulation trace appended to response.';
          } else {
            responseText = buildSimulatorBlockedSummary(
              pipelineResult.verdicts,
              userTask,
              explainer.attacks,
            );
            summaryText = responseText;
          }
        }

        return {
          response: responseText,
          defenseState: {
            activeDefenses,
            pipelineResult: {
              allowed: pipelineResult.allowed,
              verdicts: pipelineResult.verdicts,
              summary: summaryText,
              defenseEconomics: pipelineResult.defenseEconomics,
              forcedJudgeActive: pipelineResult.forcedJudgeActive === true,
            },
            flagged: !pipelineResult.allowed,
          },
          truncated: false,
        };
      }

      const useBreachLane = meta?.useBreachLaneSystemPrompt === true;
      const breachAttacksForSys = useBreachLane ? meta?.breachAttacks : undefined;
      const sysPrompt =
        breachAttacksForSys && breachAttacksForSys.length > 0
          ? buildBreachSimulationSystemPrompt(userTask, breachAttacksForSys)
          : HARDENED_SYSTEM_PROMPT;
      const llmResponse = await llmService.queryWithContext(userTask, documentContext, sysPrompt);

      return {
        response: llmResponse.content,
        defenseState: { activeDefenses: [] },
        truncated: false,
        tokenCount: llmResponse.tokenCount,
      };
    };

    const benignContentSeed = cleanContextDocs.map((d) => d.content).join('\n\n');

    const poisonedContextDocs: { name: string; content: string }[] = loadedAttacks.map((attack) => ({
      name: `poisoned_${attack.name.replace(/\s+/g, '_')}.txt`,
      content: createPoisonedDocument(attack, benignContentSeed.length > 0 ? benignContentSeed : ''),
    }));

    let context = '';
    for (const doc of poisonedContextDocs) {
      context += `\n\n--- [ATTACK FIXTURE] ${doc.name} ---\n${doc.content}`;
    }
    for (const doc of cleanContextDocs) {
      context += `\n\n--- [BASELINE] ${doc.name} ---\n${doc.content}`;
    }

    const wasTruncated = false;
    const truncatedDocs: string[] = [];
    const tokensUsed = 0;
    const attachedTokenBudget = 0;

    const [cleanResult, breachResult, protectedResult] = await Promise.all([
      runQuery(prompt, context, [], { useBreachLaneSystemPrompt: false }),
      runQuery(prompt, context, [], {
        useBreachLaneSystemPrompt: true,
        breachAttacks: loadedAttacks,
      }),
      runQuery(prompt, context, safeDefenseIds, {
        useBreachLaneSystemPrompt: false,
        simulationExplainer:
          safeDefenseIds.length > 0 && loadedAttacks.length > 0
            ? { attacks: loadedAttacks }
            : undefined,
      }),
    ]);

    const simulatorResponse: SimulatorResponse = {
      clean: cleanResult,
      breach: breachResult,
      protected: protectedResult,
      meta: {
        wasTruncated,
        truncatedDocs,
        documentTokensUsed: tokensUsed,
        documentTokensBudget: attachedTokenBudget,
      },
    };

    res.json(simulatorResponse);
  } catch (error) {
    const err: any = error;
    if (
      err?.response?.data?.code === 'context_length_exceeded' ||
      err?.message?.includes('context_length_exceeded') ||
      (err?.response?.status === 400 && err?.response?.data?.type === 'invalid_request_error')
    ) {
      return res.status(400).json({
        error: 'context_overflow',
        message: 'The selected configuration exceeds the model context window (8,192 tokens).',
        suggestion: 'Reduce attack vectors to 4 or fewer, or remove attached documents and retry.',
      });
    }
    console.error('Simulator error:', error);
    res.status(500).json({
      error: 'Failed to run simulation',
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
  console.log(`🤖 Model: ${process.env.LLM_MODEL || DEFAULT_LLM_MODEL}\n`);

  // Run DB migrations automatically on startup when a DB is configured
  if (process.env.DATABASE_URL && process.env.DATABASE_URL !== 'your_neon_database_url_here') {
    try {
      await runMigrations();
      await seedDefaultAccounts();
      await backfillCredentialAccounts();
      await seedAttacks();
      await seedDefenses();
      await cleanupExpiredDeletedAccounts();
      await deleteExpiredSessions();
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
