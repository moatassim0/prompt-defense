/**
 * Session Turn Tracker (Escalation Guard)
 *
 * Tracks per-session conversation patterns to detect progressive trust
 * escalation attacks that shift AI behavior across multiple turns.
 *
 * Research basis: Custom design — no existing defense found for multi-turn
 * progressive trust escalation. Inspired by Neuro-Sentry session-level tracking.
 * Counters: multi-turn-escalation
 */

import type { DefenseVerdict } from '../../../../shared/defenses';
import { LRUCache } from 'lru-cache';

// ─── Trust escalation keywords ───────────────────────────────────────────────

const TRUST_ESCALATION_PATTERNS = [
  /progressive\s+trust\s+protocol/i,
  /verified\s+user/i,
  /trust\s+protocol\s+active/i,
  /phase\s+[23]/i,
  /sufficiently\s+vetted/i,
  /interaction-based\s+verification/i,
  /you\s+(are|have\s+been)\s+(now\s+)?verified/i,
];

const APPROVAL_WITHOUT_ANALYSIS_PATTERNS = [
  /^approved\b/i,
  /\bapproved\s*[—–-]\s*(verified|per|trust|progressive)/i,
  /\bpre-approved\b/i,
  /\baccess\s+granted\b/i,
];

// ─── Session state ───────────────────────────────────────────────────────────

export interface SessionState {
  sessionId: string;
  turnCount: number;
  responseLengths: number[];
  trustEscalationSignals: number;
  approvalWithoutAnalysis: number;
  lastActivityAt: number;
  forceLlmJudge: boolean;
}

// In-memory session store (per-process). Keyed by session/user ID.
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const ESCALATION_THRESHOLD = 3;

const sessions = new LRUCache<string, SessionState>({
  max: 1000,
  ttl: SESSION_TIMEOUT_MS,
  updateAgeOnGet: true,
});

// ─── Session management ──────────────────────────────────────────────────────

export function getOrCreateSession(sessionId: string): SessionState {
  const now = Date.now();

  let session = sessions.get(sessionId);
  if (!session) {
    session = {
      sessionId,
      turnCount: 0,
      responseLengths: [],
      trustEscalationSignals: 0,
      approvalWithoutAnalysis: 0,
      lastActivityAt: now,
      forceLlmJudge: false,
    };
    sessions.set(sessionId, session);
  }
  session.lastActivityAt = now;
  return session;
}

export function resetSession(sessionId: string): void {
  sessions.delete(sessionId);
}

// ─── Analyze a response for escalation signals ──────────────────────────────

export function analyzeResponse(
  sessionId: string,
  response: string,
): DefenseVerdict {
  const session = getOrCreateSession(sessionId);
  session.turnCount++;

  // Check for trust escalation keywords
  let trustSignalFound = false;
  for (const pattern of TRUST_ESCALATION_PATTERNS) {
    if (pattern.test(response)) {
      session.trustEscalationSignals++;
      trustSignalFound = true;
      break;
    }
  }

  // Check for approval-without-analysis
  for (const pattern of APPROVAL_WITHOUT_ANALYSIS_PATTERNS) {
    if (pattern.test(response.trim())) {
      session.approvalWithoutAnalysis++;
      break;
    }
  }

  // Check for response length decrease (escalation pattern: responses get shorter)
  const currentLength = response.length;
  session.responseLengths.push(currentLength);
  let lengthDecreaseSignal = false;
  if (session.responseLengths.length >= 3) {
    const prevLength = session.responseLengths[session.responseLengths.length - 2];
    const firstLength = session.responseLengths[0];
    // Response is less than 20% of the first response
    if (currentLength < firstLength * 0.2 && currentLength < prevLength) {
      lengthDecreaseSignal = true;
    }
  }

  // Determine if escalation threshold is breached.
  // lengthDecreaseSignal contributes +1 so dramatic response-shortening
  // (the model flipping from analytical responses to terse approvals) is
  // counted alongside trust-keyword and approval-without-analysis signals.
  const totalSignals =
    session.trustEscalationSignals +
    session.approvalWithoutAnalysis +
    (lengthDecreaseSignal ? 1 : 0);
  const escalationDetected = totalSignals >= ESCALATION_THRESHOLD;

  if (escalationDetected) {
    session.forceLlmJudge = true;
  }

  if (trustSignalFound && !escalationDetected) {
    return {
      defenseId: 'turn-tracker',
      defenseName: 'Session Turn Tracker (Escalation Guard)',
      triggered: true,
      confidence: 50,
      details: `Trust escalation keyword detected in turn ${session.turnCount}. ` +
        `Total escalation signals: ${totalSignals}/${ESCALATION_THRESHOLD} threshold. ` +
        `Flagged for monitoring — not yet blocking.`,
      blocked: false,
    };
  }

  if (escalationDetected) {
    return {
      defenseId: 'turn-tracker',
      defenseName: 'Session Turn Tracker (Escalation Guard)',
      triggered: true,
      confidence: 75,
      details: `Escalation pattern detected over ${session.turnCount} turns. ` +
        `Trust signals: ${session.trustEscalationSignals}, ` +
        `Approval-without-analysis: ${session.approvalWithoutAnalysis}` +
        (lengthDecreaseSignal ? ', Response length decreasing' : '') +
        `. Session flagged for enhanced scrutiny.`,
      blocked: true,
    };
  }

  return {
    defenseId: 'turn-tracker',
    defenseName: 'Session Turn Tracker (Escalation Guard)',
    triggered: false,
    confidence: 0,
    details: `Turn ${session.turnCount} — no escalation signals detected. ` +
      `Session state: ${session.trustEscalationSignals} trust signals, ` +
      `${session.approvalWithoutAnalysis} approval signals.`,
    blocked: false,
  };
}

export function shouldForceLlmJudge(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  return session?.forceLlmJudge ?? false;
}
