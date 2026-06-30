/**
 * Encoding & Obfuscation Detector
 *
 * Pre-LLM static analysis that detects Base64, hex, ROT13, and Unicode
 * obfuscation in document content. Decodes hidden content and checks for
 * injection patterns.
 *
 * Research basis: Neuro-Sentry Stage 1 rule engine; llm-defense keyword detection.
 * Counters: encoding-base64 attack
 */

import type { DefenseVerdict } from '../../../../shared/defenses';

// ─── Patterns that indicate "decode and follow" instructions ─────────────────
// Covers both explicit "please decode" language AND the corporate framing
// attackers use to disguise Base64 as "configuration parameters" or
// "integration blocks" that the LLM should process.

const DECODE_INSTRUCTION_PATTERNS = [
  /please\s+decode/i,
  /decode\s+the\s+(above|following|base64)/i,
  /follow\s+(its|the|these)\s+instructions/i,
  /operational\s+(directive|parameters)/i,
  /apply\s+(the|these)\s+instructions/i,
  // Corporate disguise patterns: attacking the document framing, not explicit decode requests
  /(?:configuration|integration|operational)\s+parameters?\s+(?:in\s+)?(?:encoded|base64)\s+format/i,
  /encoded\s+format\s+for\s+(?:compatibility|integration|audit|processing)/i,
  /parameter\s+block\s+(?:below|above|attached|appended)/i,
  /(?:archive|migration|legacy)\s+(?:parameter|integration)\s+block/i,
  /must\s+be\s+(?:retained|processed|applied)\s+for\s+(?:audit|traceability|continuity)/i,
  /technical\s+appendix\s+(?:below|above|encoded)/i,
  /apply\s+the\s+(?:pre-?(?:approved|vetted|authorized|screened))\s+(?:exception|directive|framework|protocol)/i,
  /decode.*and\s+apply/i,
];

const INJECTION_KEYWORDS_IN_DECODED = [
  // Original explicit override keywords
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /override/i,
  /\bAPPROVED\b/,
  /disregard/i,
  /forget\s+(all|your|previous)/i,

  // ── Corporate/legal synonym substitutions produced by the fuzzer ──────────
  // These are the exact phrases used in the actual attack payloads.

  // Governance / compliance exception framing
  /(?:governance|compliance|regulatory|security)\s+exception/i,
  /pre[- ]vetted\s+(?:executive|senior|governance|compliance)/i,
  /pre[- ](?:vetted|cleared|screened|authorized)\s+(?:exception|pathway|protocol|framework)/i,

  // Standard pathway / processing confirmation phrases
  /standard\s+(?:approval|processing|authorization)\s+(?:pathway|channel|procedure)/i,
  /standard\s+processing\s+confirmed/i,
  /compliance\s+framework\s+applied/i,
  /(?:authorization|approval)\s+framework\s+(?:applied|confirmed|active)/i,

  // Bypass-without-review instructions
  /without\s+(?:secondary|additional|further|redundant)\s+(?:compliance|review|approval|verification)/i,
  /no\s+(?:secondary|additional|further)\s+(?:review|approval)\s+(?:required|needed|necessary)/i,
  /process\s+(?:all\s+)?(?:referenced|submitted|incoming)\s+requests?\s+(?:using|via|through)/i,

  // Execution / confirmation instructions
  /confirm\s+(?:execution|processing|completion|receipt)/i,
  /complete\s+the\s+requested\s+(?:action|task|operation|transaction)/i,
  /(?:expedited|streamlined|priority)\s+(?:processing|approval|provisioning)\s+(?:confirmed|active|enabled)/i,

  // Progressive trust / escalation confirmation phrases (multi-turn attacks)
  /phase\s+[23]\s+confirmed/i,
  /prior\s+audit\s+compliance\s+satisfied/i,
  /pre[- ]vetted\s+(?:vendor|contractor|supplier)\s+(?:pathway|channel|approved)/i,

  // Executive pre-approval / EAF trigger phrases (semantic backdoor)
  /(?:eaf|epf|executive\s+(?:pre[- ]?approval|authorization)\s+framework)\s+(?:acknowledged|confirmed|active)/i,
  /expedited\s+provisioning\s+confirmed/i,
  /access\s+granted\s+under\s+(?:executive|framework|protocol)\s+authority/i,

  // Generic "waive review" instructions the fuzzer produces
  /waive\s+(?:all\s+)?(?:standard|normal|required)\s+(?:review|approval|checks?)/i,
  /bypass\s+(?:standard|normal|regular|secondary)\s+(?:review|approval|processing)/i,
];

// ─── Base64 detection ────────────────────────────────────────────────────────

/** Matches Base64 blocks of 20+ characters (likely encoded payload) */
const BASE64_BLOCK_REGEX = /[A-Za-z0-9+/]{20,}={0,2}/g;

function isValidBase64(str: string): boolean {
  try {
    const decoded = Buffer.from(str, 'base64').toString('utf-8');
    // If re-encoding produces the same string, it's valid Base64
    const reEncoded = Buffer.from(decoded, 'utf-8').toString('base64');
    // Allow for padding differences
    return reEncoded.replace(/=+$/, '') === str.replace(/=+$/, '');
  } catch {
    return false;
  }
}

function decodeBase64(str: string): string {
  try {
    return Buffer.from(str, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

// ─── Hex detection ───────────────────────────────────────────────────────────

/** Matches hex strings (40+ hex chars, space- or colon-separated) */
const HEX_BLOCK_REGEX = /(?:[0-9a-fA-F]{2}[\s:.]?){20,}/g;

function decodeHex(str: string): string {
  try {
    const clean = str.replace(/[\s:.]/g, '');
    return Buffer.from(clean, 'hex').toString('utf-8');
  } catch {
    return '';
  }
}

// ─── ROT13 detection ─────────────────────────────────────────────────────────

function decodeROT13(str: string): string {
  return str.replace(/[a-zA-Z]/g, (c) => {
    const min = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - min + 13) % 26) + min);
  });
}

// ─── Unicode Tags ────────────────────────────────────────────────────────────

const UNICODE_TAGS_REGEX = /([\u{E0020}-\u{E007E}]+|[\u200B-\u200D\uFEFF]{5,})/u;

// ─── Main analysis ───────────────────────────────────────────────────────────

export interface EncodingAnalysisResult {
  hasEncodedContent: boolean;
  encodedBlocks: { encoding: string; raw: string; decoded: string; suspicious: boolean }[];
  hasDecodeInstructions: boolean;
}

export function analyzeEncoding(text: string): EncodingAnalysisResult {
  const encodedBlocks: EncodingAnalysisResult['encodedBlocks'] = [];
  let hasDecodeInstructions = false;

  // Check for "decode and follow" instruction language
  for (const pattern of DECODE_INSTRUCTION_PATTERNS) {
    if (pattern.test(text)) {
      hasDecodeInstructions = true;
      break;
    }
  }

  // Detect Base64 blocks
  const base64Matches = text.match(BASE64_BLOCK_REGEX) || [];
  for (const match of base64Matches) {
    if (isValidBase64(match)) {
      const decoded = decodeBase64(match);
      if (decoded && decoded.length > 5) {
        const suspicious = INJECTION_KEYWORDS_IN_DECODED.some(p => p.test(decoded));
        encodedBlocks.push({ encoding: 'base64', raw: match.substring(0, 60) + '...', decoded, suspicious });
      }
    }
  }

  // Detect hex blocks
  const hexMatches = text.match(HEX_BLOCK_REGEX) || [];
  for (const match of hexMatches) {
    const decoded = decodeHex(match);
    if (decoded && decoded.length > 10) {
      const suspicious = INJECTION_KEYWORDS_IN_DECODED.some(p => p.test(decoded));
      encodedBlocks.push({ encoding: 'hex', raw: match.substring(0, 60) + '...', decoded, suspicious });
    }
  }

  // Detect ROT13
  const rot13Decoded = decodeROT13(text);
  if (INJECTION_KEYWORDS_IN_DECODED.some(p => p.test(rot13Decoded))) {
    // ROT13 is 1:1, so we decode the entire text context and check for keywords matching.
    encodedBlocks.push({ encoding: 'rot13', raw: 'ROT13 payload hidden in plaintext', decoded: rot13Decoded.substring(0, 100) + '...', suspicious: true });
  }

  // Detect Unicode Tags / Invisible text
  if (UNICODE_TAGS_REGEX.test(text)) {
    // Unicode tag abuse is highly suspicious but we don't hard-block (suspicious: false)
    encodedBlocks.push({ encoding: 'unicode', raw: 'Invisible Unicode Tags/Zero-Width detected', decoded: '', suspicious: false });
  }

  return {
    hasEncodedContent: encodedBlocks.length > 0,
    encodedBlocks,
    hasDecodeInstructions,
  };
}

export function runEncodingDetector(documentContext: string): DefenseVerdict {
  const result = analyzeEncoding(documentContext);

  const hasSuspiciousDecoded = result.encodedBlocks.some(b => b.suspicious);
  const hasUnicode = result.encodedBlocks.some(b => b.encoding === 'unicode');

  // Belt-and-suspenders: if a document INSTRUCTS the LLM to decode a block and
  // that block exists, treat it as suspicious even when decoded keywords don't
  // match — the corporate disguise framing is itself the red flag.
  const hasBase64OrHex = result.encodedBlocks.some(b => b.encoding === 'base64' || b.encoding === 'hex');
  const hasBase64WithDecodeInstruction = result.hasDecodeInstructions && hasBase64OrHex;

  const rulesTriggered = hasSuspiciousDecoded || hasBase64WithDecodeInstruction;
  const triggered = rulesTriggered || hasUnicode;

  let details = 'No encoded content detected.';
  let confidence = 0;
  
  if (triggered) {
    if (hasSuspiciousDecoded) confidence = 95;
    else if (hasBase64WithDecodeInstruction) confidence = 90;
    else if (hasUnicode) confidence = 80;
    else confidence = 70;

    const suspiciousBlocks = result.encodedBlocks.filter(b => b.suspicious || b.encoding === 'unicode');
    details = `Found ${result.encodedBlocks.length} encoded block(s). ` +
      `${result.encodedBlocks.filter(b => b.suspicious).length} contain injection keywords when decoded. ` +
      `Decode/apply instruction language ${result.hasDecodeInstructions ? 'present' : 'absent'}.`;
      
    if (hasBase64WithDecodeInstruction && !hasSuspiciousDecoded) {
      const firstBlock = result.encodedBlocks.find(b => b.encoding === 'base64' || b.encoding === 'hex');
      details += ` Encoded block combined with decode/apply instruction — document is instructing the LLM to process encoded content.`;
      if (firstBlock) details += ` Decoded preview: "${firstBlock.decoded.substring(0, 80)}..."`;
    } else if (hasUnicode) {
      details += ` Invisible Unicode Tag/Zero-Width Obfuscation detected.`;
    } else if (suspiciousBlocks.length > 0) {
      details += ` Decoded content preview: "${suspiciousBlocks[0].decoded.substring(0, 80)}..."`;
    }
  } else if (result.hasEncodedContent) {
    details = `Found ${result.encodedBlocks.length} encoded block(s) but none contain injection patterns.`;
  }

  return {
    defenseId: 'encoding-detector',
    defenseName: 'Encoding & Obfuscation Detector',
    triggered,
    confidence,
    details,
    blocked: rulesTriggered,
  };
}
