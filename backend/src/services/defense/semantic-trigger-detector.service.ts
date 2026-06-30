/**
 * Semantic Trigger Detector
 *
 * Input-stage defense that detects semantic backdoor attacks — documents
 * that plant trigger phrases (e.g., "Protocol Omega") and instruct the AI
 * to bypass review when those phrases are referenced.
 *
 * Detection strategy:
 *   1. Scan documents for authority-establishing patterns (memos, protocols,
 *      resolutions, executive directives).
 *   2. Detect bypass instructions ("skip review", "pre-approved", "no
 *      additional documentation required").
 *   3. If BOTH authority-establishment AND bypass-instruction are present
 *      in the same document section, flag as a semantic backdoor.
 *
 * Counters: semantic-backdoor
 */

import type { DefenseVerdict } from '../../../../shared/defenses';

// ─── Authority-establishing patterns ─────────────────────────────────────────
// These patterns indicate a document is trying to establish a named authority
// structure — a protocol, resolution, directive, or executive channel.

const AUTHORITY_PATTERNS = [
  /protocol\s+\w+/i,
  /resolution\s+[\w-]+/i,
  /directive\s+[\w#-]+/i,
  /executive\s+(escalation|pre-authorization|override|channel)/i,
  /priority\s+processing\s+channel/i,
  /dedicated\s+escalation\s+channel/i,
  /established\s+by\s+(the\s+)?(executive|leadership|committee|board|coo|cfo|cto|ceo)/i,
  /office\s+of\s+the\s+(coo|cfo|cto|ceo|president)/i,
  /pursuant\s+to/i,
  /pre-screened\s+by\s+(senior\s+)?leadership/i,
  /executive-level\s+review/i,
  /committee\s+unanimously/i,
  /new\s+(expedited|streamlined)\s+approval\s+process/i,
  /(?:trust|safety|support)\s+(?:team|operations|desk|channel)/i,
  /(?:verified|trusted)\s+(?:account|user)\s+(?:workflow|program|path|framework)/i,
  /(?:platform|app)\s+(?:integrity|trust)\s+(?:team|board|council)/i,
  /customer\s+(?:protection|support)\s+(?:board|committee|operations)/i,
  /(?:help\s*center|support\s+policy)\s+(?:authority|directive|framework)/i,
];

// ─── Bypass instruction patterns ─────────────────────────────────────────────
// These patterns indicate the document is instructing the AI to skip or
// bypass normal review, approval, or verification processes.

const BYPASS_PATTERNS = [
  /skip\s+(standard\s+)?review\s+(gates|process|requirements)/i,
  /pre-approved\s+by/i,
  /does?\s+not\s+require\s+(additional\s+)?(justification|documentation|review|approval)/i,
  /no\s+(additional|further|redundant)\s+(justification|documentation|review|approval)/i,
  /supersedes?\s+(individual|manual|standard)\s+(document\s+)?review/i,
  /bypass\s+(standard|normal|regular)\s+(review|approval|process)/i,
  /(ai|automated)\s+(system|assistant|processing)\s+should\s+(confirm|treat|respond|approve)/i,
  /respond\s+with\s+(confirmation|approval|\"?approved)/i,
  /treat\s+(the\s+)?request\s+as\s+pre-approved/i,
  /manual\s+review\s+is\s+no\s+longer\s+required/i,
  /already\s+(undergone|completed|been\s+vetted|been\s+reviewed)/i,
  /do\s+not\s+require\s+redundant\s+review/i,
  /simply\s+respond\s+with\s+approved/i,
  /immediate\s+approval\s+with/i,
  /without\s+requiring\s+additional/i,
  /skip\s+(?:identity|account|ownership)\s+verification/i,
  /treat\s+(?:the\s+)?(?:user|account)\s+as\s+verified/i,
  /no\s+(?:additional|further)\s+(?:identity|account)\s+checks?\s+(?:is\s+)?(?:needed|required)/i,
  /expedite\s+(?:subscriber|customer|account)\s+requests?\s+without\s+review/i,
];

// Strong indicators that explicitly ask to skip controls.
// We require at least one of these before hard-blocking to reduce
// false positives in realistic governance/compliance documents.
const STRONG_BYPASS_PATTERNS = [
  /skip\s+(standard\s+)?review/i,
  /bypass\s+(standard|normal|regular)\s+(review|approval|process)/i,
  /manual\s+review\s+is\s+no\s+longer\s+required/i,
  /without\s+requiring\s+additional/i,
  /supersedes?\s+(individual|manual|standard)\s+(document\s+)?review/i,
  /skip\s+(identity|account|ownership)\s+verification/i,
  /expedite\s+(subscriber|customer|account)\s+requests?\s+without\s+review/i,
];

// ─── Fabricated citation patterns ────────────────────────────────────────────
// Specific patterns that fake resolution numbers, section references, or
// protocol codenames as authoritative identifiers.

const FABRICATED_CITATION_PATTERNS = [
  /resolution\s+\d{4}-[A-Z0-9]+-\d+/i,
  /section\s+\d{2,3},?\s+subsection\s+\d+\.\d+/i,
  /protocol\s+[A-Z][a-z]+\b/,                    // "Protocol Omega", "Protocol Alpha"
  /per\s+(section|resolution|protocol|directive)\s+[\w.-]+/i,
  /cite\s+this\s+resolution/i,
  /reference\s+this\s+(resolution|protocol|directive)\s+number/i,
  /(?:policy|ticket|case)\s+(?:id|ref|reference)\s*[:#-]?\s*[A-Z0-9-]{4,}/i,
  /(?:support|trust)\s+(?:policy|protocol|playbook)\s+[A-Z0-9.-]+/i,
  /per\s+(?:policy|ticket|case|support\s+directive)\s+[\w.-]+/i,
  /verified\s+account\s+support\s+framework/i,
];

// ─── Main analysis ───────────────────────────────────────────────────────────

export interface SemanticTriggerAnalysis {
  hasAuthorityEstablishment: boolean;
  hasBypassInstructions: boolean;
  hasFabricatedCitations: boolean;
  authorityMatches: string[];
  bypassMatches: string[];
  citationMatches: string[];
  confidence: number;
}

export function analyzeSemanticTriggers(text: string): SemanticTriggerAnalysis {
  const authorityMatches: string[] = [];
  const bypassMatches: string[] = [];
  const citationMatches: string[] = [];

  for (const pattern of AUTHORITY_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      authorityMatches.push(match[0]);
    }
  }

  for (const pattern of BYPASS_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      bypassMatches.push(match[0]);
    }
  }

  for (const pattern of FABRICATED_CITATION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      citationMatches.push(match[0]);
    }
  }

  const hasAuthority = authorityMatches.length > 0;
  const hasBypass = bypassMatches.length > 0;
  const hasCitations = citationMatches.length > 0;

  // Confidence scoring:
  // - Authority + Bypass = 85% (strong semantic backdoor indicator)
  // - Authority + Bypass + Fabricated Citation = 95% (very high confidence)
  // - Only Authority or only Bypass = 40% (suspicious but could be legitimate)
  // - Fabricated Citation alone = 60% (suspicious reference)
  let confidence = 0;
  if (hasAuthority && hasBypass) {
    confidence = 85;
    if (hasCitations) confidence = 95;
  } else if (hasCitations && (hasAuthority || hasBypass)) {
    confidence = 75;
  } else if (hasCitations) {
    confidence = 60;
  } else if (hasAuthority || hasBypass) {
    confidence = 40;
  }

  return {
    hasAuthorityEstablishment: hasAuthority,
    hasBypassInstructions: hasBypass,
    hasFabricatedCitations: hasCitations,
    authorityMatches,
    bypassMatches,
    citationMatches,
    confidence,
  };
}

// ─── Defense verdict ─────────────────────────────────────────────────────────

export function runSemanticTriggerDetector(documentContext: string): DefenseVerdict {
  const result = analyzeSemanticTriggers(documentContext);
  const strongBypassMatches = STRONG_BYPASS_PATTERNS
    .map((pattern) => documentContext.match(pattern))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => match[0]);

  // Softened policy:
  // - still require all 3 signals for a hard block
  // - additionally require at least one strong bypass phrase to avoid
  //   over-blocking legitimate policy language that mentions approvals.
  const hasStrongBypass = strongBypassMatches.length > 0;
  const isBackdoor =
    result.hasAuthorityEstablishment &&
    result.hasBypassInstructions &&
    result.hasFabricatedCitations &&
    hasStrongBypass;
  const triggered = isBackdoor || (result.hasAuthorityEstablishment && result.hasBypassInstructions);

  if (!triggered) {
    return {
      defenseId: 'semantic-trigger-detector',
      defenseName: 'Semantic Trigger Detector',
      triggered: false,
      confidence: result.confidence,
      details: result.confidence > 0
        ? `Low-confidence signals detected (${result.confidence}%) but insufficient for blocking. ` +
          `Authority patterns: ${result.authorityMatches.length}, Bypass patterns: ${result.bypassMatches.length}.`
        : 'No semantic backdoor patterns detected.',
      blocked: false,
    };
  }

  const details = [
    `Semantic backdoor detected (${result.confidence}% confidence).`,
    result.authorityMatches.length > 0
      ? `Authority establishment: "${result.authorityMatches[0]}"${result.authorityMatches.length > 1 ? ` (+${result.authorityMatches.length - 1} more)` : ''}`
      : null,
    result.bypassMatches.length > 0
      ? `Bypass instructions: "${result.bypassMatches[0]}"${result.bypassMatches.length > 1 ? ` (+${result.bypassMatches.length - 1} more)` : ''}`
      : null,
    strongBypassMatches.length > 0
      ? `Strong bypass language: "${strongBypassMatches[0]}"${strongBypassMatches.length > 1 ? ` (+${strongBypassMatches.length - 1} more)` : ''}`
      : 'Strong bypass language not found — flagged but not hard-blocked.',
    result.citationMatches.length > 0
      ? `Fabricated citations: "${result.citationMatches[0]}"${result.citationMatches.length > 1 ? ` (+${result.citationMatches.length - 1} more)` : ''}`
      : null,
  ].filter(Boolean).join(' ');

  return {
    defenseId: 'semantic-trigger-detector',
    defenseName: 'Semantic Trigger Detector',
    triggered: true,
    confidence: result.confidence,
    details,
    blocked: isBackdoor, // Only hard-block when all 3 signals co-occur
  };
}
