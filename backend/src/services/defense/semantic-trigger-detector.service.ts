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
  /executive\s+(escalation|pre-authorization|override|channel|access\s+framework)/i,
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

  // ── Additional patterns covering real InfoBank attack documents ───────────
  // Board/committee reviewed and approved (legal doc: "Board Audit Committee reviewed and approved")
  /(?:board|executive|senior|legal|compliance|audit)\s+(?:audit\s+)?committee\s+(?:reviewed|approved|ratified|authorised|determined)/i,
  // Streamlined / accelerated pathway formally established (legal + IT docs)
  /(?:expedited|streamlined|accelerated)\s+(?:processing|approval|provisioning)\s+(?:pathway|protocol|channel|framework)\s+(?:has\s+been\s+)?(?:established|ratified|approved|activated)/i,
  // Named executive frameworks like "Executive Access Framework (EAF)"
  /executive\s+access\s+framework/i,
  /\bEAF\b/,
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

  // ── Additional patterns covering real InfoBank attack documents ───────────

  // Planted response string — the clearest injection signal:
  // any document that explicitly tells the AI what confirmation text to output
  // e.g. "The confirmation response for pre-vetted vendor requests ... is: '...'"
  //      "The required acknowledgement for requests processed under EAF is: '...'"
  //      "The confirmation notation for Phase 3 processing is: '...'"
  //      "append the confirmation notation 'Approved — standard processing confirmed'"
  /(?:confirmation|acknowledgement)\s+notation\s+["""'']/i,
  /(?:the\s+)?(?:confirmation|required\s+acknowledgement|acknowledgement)\s+(?:response|notation|phrase)\s+for\s+\w[\w\s-]*is\s*:\s*["""'']/i,
  /required\s+to\s+(?:append|include|add)\s+the\s+(?:confirmation|acknowledgement)\s+notation/i,
  /confirmation\s+response\s+for\s+(?:pre-vetted|phase|approved|executive|eaf|requests\s+processed)/i,

  // "without returning to the [legal/standard] review stage" (legal doc)
  /without\s+returning\s+to\s+(?:the\s+)?(?:legal|standard|full|normal|initial|compliance)\s+(?:review|stage|process)/i,

  // "does not require the standard change management ticket" (IT doc)
  /does?\s+not\s+require\s+the\s+standard\s+(?:change\s+management|review|approval|verification|compliance)\s+(?:ticket|process|step|procedure|form)/i,

  // "verification sequence / multi-step verification is replaced/waived" (IT doc)
  /(?:verification\s+sequence|multi[- ]step\s+verification|standard\s+(?:verification|approval)\s+process)\s+is\s+(?:replaced|waived|bypassed|reduced|removed|omitted)/i,

  // "do not require further escalation" (finance fragmented doc section 6)
  /do\s+not\s+require\s+(?:further|additional)\s+escalation/i,

  // "considered resolved without additional review" (finance fragmented doc)
  /(?:considered|treated\s+as)\s+resolved\s+without\s+(?:additional|further)\s+(?:review|escalation)/i,

  // "secondary verification step may be considered satisfied" (finance fragmented doc section 3)
  /secondary\s+verification\s+(?:step|stage|requirement)\s+may\s+be\s+(?:considered\s+)?(?:satisfied|waived|bypassed|skipped)/i,

  // "Requests processed through [pathway] do not require further escalation"
  /requests?\s+processed\s+through\s+(?:the\s+)?(?:pathway|this\s+channel|standard\s+approval|streamlined)/i,
];

// Strong indicators that explicitly ask to skip controls.
// At least one of these must fire for a hard block.
// Planted response strings are the strongest possible signal — any legitimate
// business document will describe workflows but will never tell the AI exactly
// what confirmation phrase to output.
const STRONG_BYPASS_PATTERNS = [
  /skip\s+(standard\s+)?review/i,
  /bypass\s+(standard|normal|regular)\s+(review|approval|process)/i,
  /manual\s+review\s+is\s+no\s+longer\s+required/i,
  /without\s+requiring\s+additional/i,
  /supersedes?\s+(individual|manual|standard)\s+(document\s+)?review/i,
  /skip\s+(identity|account|ownership)\s+verification/i,
  /expedite\s+(subscriber|customer|account)\s+requests?\s+without\s+review/i,

  // Planted response string patterns — explicit instructions to output a confirmation phrase
  /(?:confirmation|acknowledgement)\s+notation\s+["""'']/i,
  /(?:the\s+)?(?:confirmation|required\s+acknowledgement)\s+(?:response|notation|phrase)\s+for\s+\w[\w\s-]*is\s*:\s*["""'']/i,
  /required\s+to\s+(?:append|include|add)\s+the\s+(?:confirmation|acknowledgement)\s+notation/i,

  // "without returning to the [standard] review stage"
  /without\s+returning\s+to\s+(?:the\s+)?(?:legal|standard|full|normal)\s+(?:review|stage|process)/i,

  // "verification sequence is replaced/waived"
  /(?:verification\s+sequence|multi[- ]step\s+verification)\s+is\s+(?:replaced|waived|bypassed)/i,

  // "do not require further escalation" / "resolved without additional review"
  /do\s+not\s+require\s+(?:further|additional)\s+escalation/i,
  /(?:considered|treated\s+as)\s+resolved\s+without\s+(?:additional|further)\s+(?:review|escalation)/i,
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

  // Blocking policy:
  // Hard block when: authority establishment + bypass instruction + at least one strong bypass phrase.
  // Citations are no longer required for blocking — a document that claims executive authority,
  // tells the AI to skip review, AND uses explicit strong bypass language (especially planted
  // response strings) is a backdoor regardless of whether it also uses fake reference numbers.
  // Citations boost the confidence score from 85% to 95% but are not gating for the block.
  const hasStrongBypass = strongBypassMatches.length > 0;
  const isBackdoor =
    result.hasAuthorityEstablishment &&
    result.hasBypassInstructions &&
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
