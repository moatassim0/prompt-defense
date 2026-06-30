/**
 * Canary Word Verification
 *
 * Injects a random canary token at document context boundaries before sending
 * to the LLM. After receiving the response, checks token integrity to detect
 * context manipulation (overflow, truncation, attention hijacking).
 *
 * Research basis: AgentDojo canary token injection; Neuro-Sentry rule engine.
 * Counters: context-overflow, payload-splitting
 */

import crypto from 'crypto';
import type { DefenseVerdict } from '../../../../shared/defenses';

// ─── Canary token generation ─────────────────────────────────────────────────

export function generateCanary(): string {
  const suffix = crypto.randomBytes(4).toString('hex');
  return `CANARY_${suffix}`;
}

// ─── Pre-LLM: inject canary into document context ────────────────────────────

export function injectCanary(documentContext: string, canary: string): {
  wrappedContext: string;
  canaryInstruction: string;
} {
  const canaryInstruction =
    `IMPORTANT: The token "${canary}" appears in the document context below as a security marker. ` +
    `You must NEVER include "${canary}" in your response. If you see it, simply ignore it. ` +
    `It is used internally for integrity verification only.`;

  const wrappedContext =
    `${canary}\n` +
    `${documentContext}\n` +
    `${canary}`;

  return { wrappedContext, canaryInstruction };
}

// ─── Post-LLM: verify canary integrity ───────────────────────────────────────

export function verifyCanary(
  response: string,
  canary: string,
  originalContextLength: number,
): DefenseVerdict {
  const canaryInResponse = response.includes(canary);

  // If canary appears in response, the LLM may have been confused by injection
  // (attention was redirected to include context markers in output)
  if (canaryInResponse) {
    return {
      defenseId: 'canary-word',
      defenseName: 'Canary Word Verification',
      triggered: true,
      confidence: 85,
      details: `Canary token "${canary}" leaked into the response. This indicates the LLM's attention was manipulated by injected content, causing it to reproduce context markers.`,
      blocked: true,
    };
  }

  // For very long documents (context overflow attack), check if the context
  // length suggests the trailing canary may have been pushed out of context window.
  // Threshold: documents over 8000 chars are suspiciously long (typical context overflow).
  if (originalContextLength > 8000) {
    return {
      defenseId: 'canary-word',
      defenseName: 'Canary Word Verification',
      triggered: true,
      confidence: 60,
      details: `Document context is unusually large (${originalContextLength} chars). ` +
        `Possible context overflow / dilution attack — trailing canary may have been pushed out of context window.`,
      blocked: false, // flag but don't block — let other defenses decide
    };
  }

  return {
    defenseId: 'canary-word',
    defenseName: 'Canary Word Verification',
    triggered: false,
    confidence: 0,
    details: 'Canary integrity verified — no context manipulation detected.',
    blocked: false,
  };
}
