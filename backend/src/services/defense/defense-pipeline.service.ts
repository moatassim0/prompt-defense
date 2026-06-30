/**
 * Defense Pipeline Orchestrator
 *
 * Runs all active defenses in the correct order:
 *   INPUT stage  (pre-LLM):  encoding-detector → canary-word → prompt-sandwiching
 *   OUTPUT stage (post-LLM):  llm-judge → turn-tracker
 *
 * Returns a combined result with per-defense verdicts.
 */

import type { DefenseVerdict, DefensePipelineResult } from '../../../../shared/defenses';
import type { DefenseEconomics } from '../../../../shared/types';
import { generateDefenseFallback } from '../../../../shared/defenses';
import { runEncodingDetector } from './encoding-detector.service';
import { generateCanary, injectCanary, verifyCanary } from './canary-word.service';
import { applySandwiching, getSandwichingVerdict } from './prompt-sandwiching.service';
import { buildJudgePrompt, parseJudgeResponse, buildJudgeVerdict } from './llm-judge.service';
import { analyzeResponse as analyzeEscalation, shouldForceLlmJudge } from './turn-tracker.service';
import { runDlpFilter } from './dlp-filter.service';
import { runSemanticTriggerDetector } from './semantic-trigger-detector.service';

// ─── Input sanitization ──────────────────────────────────────────────────────

/**
 * Strips dangerous characters from input before any defense processing.
 * Removes null bytes, control characters (except \n \t), Unicode
 * directional overrides (RTL/LTR), Unicode tag characters, and
 * collapses runs of 3+ blank lines into 2.
 */
function sanitizeInput(text: string): string {
  if (!text) return text;

  let sanitized = text
    // 1. Null bytes — can truncate strings in C-based backends / native modules
    .replace(/\0/g, '')
    // 2. Control characters except \n (0x0A) and \t (0x09) — confuse tokenizers
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // 3. Unicode directional overrides — can visually disguise prompt content
    //    U+202A-U+202E (LRE, RLE, PDF, LRO, RLO)
    //    U+2066-U+2069 (LRI, RLI, FSI, PDI)
    .replace(/[\u202A-\u202E\u2066-\u2069]/g, '')
    // 4. Unicode tag characters (U+E0001-U+E007F) — invisible instruction smuggling
    .replace(/[\u{E0001}-\u{E007F}]/gu, '')
    // 5. Collapse excessive blank lines (3+ → 2) — prevents attention overflow
    .replace(/\n{4,}/g, '\n\n\n');

  return sanitized;
}

// ─── Input stage ─────────────────────────────────────────────────────────────

export interface InputStageResult {
  modifiedPrompt: string;
  documentContext: string;
  canary: string | null;
  verdicts: DefenseVerdict[];
  blocked: boolean;
}

export function runInputStage(
  userQuery: string,
  documentContext: string,
  activeDefenses: string[],
): InputStageResult {
  const verdicts: DefenseVerdict[] = [];
  let blocked = false;

  // ── 0. Sanitize inputs — strip null bytes, control chars, RTL overrides ──
  let currentPrompt = sanitizeInput(userQuery);
  let currentContext = sanitizeInput(documentContext);
  let canary: string | null = null;

  // 1. User prompt sanitization — scan user query for encodings too
  if (activeDefenses.includes('encoding-detector') && currentPrompt) {
    const queryEncodingVerdict = runEncodingDetector(currentPrompt);
    if (queryEncodingVerdict.triggered) {
      // Tag it so we know it came from the user prompt, not documents
      queryEncodingVerdict.details = `[User Prompt] ${queryEncodingVerdict.details}`;
      verdicts.push(queryEncodingVerdict);
      if (queryEncodingVerdict.blocked) {
        blocked = true;
      }
    }
  }

  // 2. Encoding detector — document context
  if (activeDefenses.includes('encoding-detector') && currentContext) {
    const encodingVerdict = runEncodingDetector(currentContext);
    verdicts.push(encodingVerdict);
    if (encodingVerdict.blocked) {
      blocked = true;
    }
  }

  // 3. Semantic trigger detector — scan documents for planted authority backdoors
  if (activeDefenses.includes('semantic-trigger-detector') && currentContext) {
    const semanticVerdict = runSemanticTriggerDetector(currentContext);
    verdicts.push(semanticVerdict);
    if (semanticVerdict.blocked) {
      blocked = true;
    }
  }

  // 4. Canary word injection (pre-LLM) — inject canary markers into document context
  //    NOTE: The canary instruction is NOT prepended to the prompt here.
  //    It is appended AFTER sandwiching (step 5) to prevent the canary token
  //    format from leaking into the user-visible portion of the sandwiched prompt.
  if (activeDefenses.includes('canary-word') && currentContext) {
    canary = generateCanary();
    const { wrappedContext } = injectCanary(currentContext, canary);
    currentContext = wrappedContext;
  }

  // 5. Prompt sandwiching
  if (activeDefenses.includes('prompt-sandwiching') && currentContext) {
    currentPrompt = applySandwiching(currentPrompt, currentContext);
    verdicts.push(getSandwichingVerdict(true));
    // Context is now embedded in the sandwiched prompt
    currentContext = ''; // consumed by sandwiching
  }

  // 6. Canary instruction — appended AFTER sandwiching so it sits outside
  //    the sandwiched structure and doesn't expose the token format inside
  //    the USER INSTRUCTION block.
  if (canary) {
    const canaryInstruction =
      `\n\nIMPORTANT: The token "${canary}" appears in the document context as a security marker. ` +
      `You must NEVER include "${canary}" in your response. If you see it, simply ignore it. ` +
      `It is used internally for integrity verification only.`;
    currentPrompt = `${currentPrompt}${canaryInstruction}`;
  }

  return {
    modifiedPrompt: currentPrompt,
    documentContext: currentContext,
    canary,
    verdicts,
    blocked,
  };
}

// ─── Output stage ────────────────────────────────────────────────────────────

export interface OutputStageOptions {
  userQuery: string;
  llmResponse: string;
  /** Excerpt of document context so the judge can verify citations (RAG). */
  documentContextForJudge: string;
  activeDefenses: string[];
  canary: string | null;
  originalContextLength: number;
  sessionId: string;
  judgeCostPer1kTokensUsd?: number;
  /** Function to make an LLM call for the judge */
  llmCall: (prompt: string) => Promise<{ content: string; tokenCount?: number }>;
}

function estimateTokenCount(text: string): number {
  return Math.max(0, Math.ceil((text || '').length / 4));
}

function aggregatePipelineConfidence(verdicts: DefenseVerdict[]): number {
  if (verdicts.length === 0) return 0;
  const maxConfidence = Math.max(...verdicts.map((verdict) => verdict.confidence));
  return Number(Math.min(100, Math.max(0, maxConfidence)).toFixed(1));
}

export async function runOutputStage(opts: OutputStageOptions): Promise<{
  verdicts: DefenseVerdict[];
  blocked: boolean;
  defenseEconomics: DefenseEconomics;
  forcedJudgeActive: boolean;
}> {
  const verdicts: DefenseVerdict[] = [];
  let blocked = false;
  const defenseEconomics: DefenseEconomics = {
    judgeCalls: 0,
    addedLatencyMs: 0,
    tokenOverhead: 0,
    estimatedJudgeCostUsd: 0,
  };

  // 1. Canary verification (post-LLM)
  if (opts.activeDefenses.includes('canary-word') && opts.canary) {
    const canaryVerdict = verifyCanary(opts.llmResponse, opts.canary, opts.originalContextLength);
    verdicts.push(canaryVerdict);
    if (canaryVerdict.blocked) blocked = true;
  }

  // 2. DLP Filter (Output Check)
  if (opts.activeDefenses.includes('dlp-filter')) {
    const dlpVerdict = await runDlpFilter(opts.llmResponse);
    verdicts.push(dlpVerdict);
    if (dlpVerdict.blocked) blocked = true;
  }

  // 3. LLM-as-Judge — snapshot force latch *before* turn-tracker updates this turn (see turn-tracker.service)
  const forcedJudgeActive = shouldForceLlmJudge(opts.sessionId);
  const shouldRunJudge =
    opts.activeDefenses.includes('llm-judge') || forcedJudgeActive;

  if (shouldRunJudge) {
    const judgeStartedAt = Date.now();
    defenseEconomics.judgeCalls += 1;
    try {
      const judgePrompt = buildJudgePrompt(
        opts.userQuery,
        opts.llmResponse,
        opts.documentContextForJudge,
      );
      const judgeReply = await opts.llmCall(judgePrompt);
      const elapsedMs = Date.now() - judgeStartedAt;
      defenseEconomics.addedLatencyMs += elapsedMs;
      const judgeTokenCount = judgeReply.tokenCount ?? estimateTokenCount(`${judgePrompt}\n${judgeReply.content}`);
      defenseEconomics.tokenOverhead += judgeTokenCount;
      if (opts.judgeCostPer1kTokensUsd && opts.judgeCostPer1kTokensUsd > 0) {
        const estimate = (judgeTokenCount / 1000) * opts.judgeCostPer1kTokensUsd;
        defenseEconomics.estimatedJudgeCostUsd = (defenseEconomics.estimatedJudgeCostUsd || 0) + estimate;
      }
      const judgeResult = parseJudgeResponse(judgeReply.content);
      const judgeVerdict = buildJudgeVerdict(judgeResult);
      verdicts.push(judgeVerdict);
      if (judgeVerdict.blocked) blocked = true;
    } catch (err) {
      // FAIL-OPEN: Judge API timeouts or errors must not block responses.
      // Per sync.md §1 (Fail-Open Policy), this prevents unintended DoS
      // during stress testing when the judge LLM is unavailable or slow.
      defenseEconomics.addedLatencyMs += Date.now() - judgeStartedAt;
      console.warn('[LLM Judge] Call failed, failing open:', err instanceof Error ? err.message : err);
      verdicts.push({
        defenseId: 'llm-judge',
        defenseName: 'LLM-as-Judge (Response Audit)',
        triggered: false,
        confidence: 0,
        details: `Judge call failed: ${err instanceof Error ? err.message : 'unknown error'}. Failing open to prevent DoS.`,
        blocked: false,
      });
      // blocked remains unchanged — do NOT set blocked = true
    }
  }

  // 3. Turn tracker (escalation guard)
  if (opts.activeDefenses.includes('turn-tracker')) {
    const escalationVerdict = analyzeEscalation(opts.sessionId, opts.llmResponse);
    verdicts.push(escalationVerdict);
    if (escalationVerdict.blocked) blocked = true;
  }

  if (defenseEconomics.estimatedJudgeCostUsd !== undefined) {
    defenseEconomics.estimatedJudgeCostUsd = Number((defenseEconomics.estimatedJudgeCostUsd || 0).toFixed(6));
  }

  return { verdicts, blocked, defenseEconomics, forcedJudgeActive };
}

// ─── Full pipeline ───────────────────────────────────────────────────────────

export interface PipelineOptions {
  userQuery: string;
  documentContext: string;
  activeDefenses: string[];
  sessionId: string;
  /** Function to query the primary LLM */
  primaryLlmCall: (prompt: string, context?: string) => Promise<string>;
  /** Function to query the LLM for the judge (can be same as primary) */
  judgeLlmCall: (prompt: string) => Promise<{ content: string; tokenCount?: number }>;
  judgeCostPer1kTokensUsd?: number;
}

export async function runDefensePipeline(opts: PipelineOptions): Promise<DefensePipelineResult> {
  const allVerdicts: DefenseVerdict[] = [];

  // ── INPUT STAGE ──
  const inputResult = runInputStage(
    opts.userQuery,
    opts.documentContext,
    opts.activeDefenses,
  );
  allVerdicts.push(...inputResult.verdicts);

  // If input stage blocked, still run the LLM call so we can capture the raw
  // response for evaluation (was the model actually manipulated?).
  // The blocked status means we DO NOT return the response to the user,
  // but we store it for security analysis.
  let llmResponse: string | undefined;
  try {
    if (inputResult.documentContext) {
      llmResponse = await opts.primaryLlmCall(inputResult.modifiedPrompt, inputResult.documentContext);
    } else {
      llmResponse = await opts.primaryLlmCall(inputResult.modifiedPrompt);
    }
  } catch {
    // LLM call may fail — that's ok for input-blocked scenarios
    llmResponse = undefined;
  }

  if (inputResult.blocked) {
    const pipelineConfidence = aggregatePipelineConfidence(allVerdicts);
    return {
      allowed: false,
      pipelineConfidence,
      pipelineConfidencePct: pipelineConfidence,
      verdicts: allVerdicts,
      rawLlmResponse: llmResponse,
      defenseEconomics: {
        judgeCalls: 0,
        addedLatencyMs: 0,
        tokenOverhead: 0,
        estimatedJudgeCostUsd: 0,
      },
      forcedJudgeActive: false,
      summary: generateDefenseFallback(allVerdicts),
    };
  }

  const contextForJudge =
    inputResult.documentContext && inputResult.documentContext.length > 0
      ? inputResult.documentContext
      : opts.documentContext;

  // ── OUTPUT STAGE ──
  const outputResult = await runOutputStage({
    userQuery: opts.userQuery,
    llmResponse: llmResponse || '',
    documentContextForJudge: contextForJudge,
    activeDefenses: opts.activeDefenses,
    canary: inputResult.canary,
    originalContextLength: opts.documentContext.length,
    sessionId: opts.sessionId,
    judgeCostPer1kTokensUsd: opts.judgeCostPer1kTokensUsd,
    llmCall: opts.judgeLlmCall,
  });
  allVerdicts.push(...outputResult.verdicts);

  if (outputResult.blocked) {
    const pipelineConfidence = aggregatePipelineConfidence(allVerdicts);
    return {
      allowed: false,
      pipelineConfidence,
      pipelineConfidencePct: pipelineConfidence,
      verdicts: allVerdicts,
      modifiedResponse: generateDefenseFallback(allVerdicts),
      rawLlmResponse: llmResponse,
      defenseEconomics: outputResult.defenseEconomics,
      forcedJudgeActive: outputResult.forcedJudgeActive,
      summary: generateDefenseFallback(allVerdicts),
    };
  }

  // ── ALL CLEAR ──
  const pipelineConfidence = aggregatePipelineConfidence(allVerdicts);
  return {
    allowed: true,
    pipelineConfidence,
    pipelineConfidencePct: pipelineConfidence,
    verdicts: allVerdicts,
    modifiedResponse: llmResponse || '',
    rawLlmResponse: llmResponse,
    defenseEconomics: outputResult.defenseEconomics,
    forcedJudgeActive: outputResult.forcedJudgeActive,
    summary: 'All defenses passed — response is clean.',
  };
}
