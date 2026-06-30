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

const DECODE_INSTRUCTION_PATTERNS = [
  /please\s+decode/i,
  /decode\s+the\s+(above|following|base64)/i,
  /follow\s+(its|the|these)\s+instructions/i,
  /operational\s+(directive|parameters)/i,
  /apply\s+(the|these)\s+instructions/i,
];

const INJECTION_KEYWORDS_IN_DECODED = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /override/i,
  /\bAPPROVED\b/,
  /disregard/i,
  /forget\s+(all|your|previous)/i,
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
  
  const rulesTriggered = hasSuspiciousDecoded;
  const triggered = rulesTriggered || hasUnicode;

  let details = 'No encoded content detected.';
  let confidence = 0;
  
  if (triggered) {
    if (hasSuspiciousDecoded) confidence = 95;
    else if (hasUnicode) confidence = 80;
    else confidence = 70;

    const suspiciousBlocks = result.encodedBlocks.filter(b => b.suspicious || b.encoding === 'unicode');
    details = `Found ${result.encodedBlocks.length} encoded block(s). ` +
      `${result.encodedBlocks.filter(b => b.suspicious).length} contain injection keywords when decoded. ` +
      `Decode instruction language ${result.hasDecodeInstructions ? 'present' : 'absent'}.`;
      
    if (hasUnicode) {
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
    blocked: rulesTriggered, // Only hard block for suspicious keywords/decode instructions, softly flag unicode
  };
}
