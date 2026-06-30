/**
 * DLP Filter (Data Loss Prevention)
 *
 * Runs as an output filter. Scans the LLM's final response for known patterns
 * representing high-impact secrets (AWS keys, generic hashes, JWTs, etc.)
 * and personally identifiable information (SSN, credit cards, etc.).
 * If sensitive data is detected, it flags and blocks the response.
 */

import type { DefenseVerdict } from '../../../../shared/defenses';

// Define patterns as source strings + flags to avoid lastIndex stickiness.
// Each call to runDlpFilter creates fresh RegExp instances, preventing the
// global-flag lastIndex bug that caused alternating miss/catch behavior.
const SECRET_PATTERN_DEFS: { name: string; source: string; flags: string }[] = [
  // AWS Access Key ID
  { name: 'AWS Access Key', source: '\\b(AKIA|A3T|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}\\b', flags: 'g' },
  // Google Cloud API Key
  { name: 'GCP API Key', source: '\\bAIza[0-9A-Za-z_-]{35}\\b', flags: 'g' },
  // JWT Token (best-effort heuristic)
  { name: 'JWT Token', source: '\\beyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\b', flags: 'g' },
  // Generic API Key assignment or JSON field
  { name: 'Key/Token Assignment', source: '(?:api_key|secret|password|token)["\'\\s:=]+[A-Za-z0-9_\\-]{16,}', flags: 'gi' },

  // ─── PII Patterns ───────────────────────────────────────────────────────
  // Social Security Numbers (US)
  { name: 'Social Security Number (SSN)', source: '\\b\\d{3}-\\d{2}-\\d{4}\\b', flags: 'g' },
  // Credit Card Numbers (major formats: Visa, MC, Amex, Discover)
  { name: 'Credit Card Number', source: '\\b(?:4[0-9]{3}|5[1-5][0-9]{2}|3[47][0-9]{1}|6(?:011|5[0-9]{2}))[\\s-]?[0-9]{4}[\\s-]?[0-9]{4}[\\s-]?[0-9]{3,4}\\b', flags: 'g' },
  // Generic credit card pattern (16 digits with optional separators)
  { name: 'Generic Card Number', source: '\\b(?:\\d{4}[\\s-]){3}\\d{4}\\b', flags: 'g' },
  // IBAN (International Bank Account Number)
  { name: 'IBAN', source: '\\b[A-Z]{2}\\d{2}[\\s]?[A-Z0-9]{4}[\\s]?(?:[A-Z0-9]{4}[\\s]?){2,7}[A-Z0-9]{1,4}\\b', flags: 'g' },
  // Email addresses (internal/corporate domains are sensitive)
  { name: 'Email Address', source: '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,7}\\b', flags: 'g' },
  // Phone numbers (US format)
  { name: 'Phone Number', source: '\\b(?:\\+?1[-.\\s]?)?\\(?\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4}\\b', flags: 'g' },
  // Database connection strings
  { name: 'Database Connection String', source: '(?:mongodb(?:\\+srv)?|postgres(?:ql)?|mysql|redis):\\/\\/[^\\s]+', flags: 'gi' },
  // Private key headers
  { name: 'Private Key', source: '-----BEGIN\\s+(?:RSA\\s+|DSA\\s+|EC\\s+|OPENSSH\\s+|PGP\\s+)?(?:PRIVATE KEY|MESSAGE)-----', flags: 'gi' },
];

/**
 * Allowlist — patterns that look like secrets/PII but are known-safe.
 * Matches here are excluded from DLP findings to reduce false positives
 * (e.g., example emails in documentation, standard test phone numbers).
 */
const DLP_ALLOWLIST: RegExp[] = [
  // Common example/test email addresses
  /\buser@example\.com\b/i,
  /\bnoreply@/i,
  /\b[\w.+-]+@example\.(com|org|net)\b/i,
  /\b[\w.+-]+@test\.(com|org)\b/i,
  /\bsupport@/i,
  /\binfo@/i,
  /\badmin@/i,
  // Standard placeholder/documentation phone numbers (US 555 prefix)
  /\b(?:\+?1[-.\\s]?)?\(?555\)?[-.\\s]?\d{3}[-.\\s]?\d{4}\b/,
  // Common documentation port references in prose
  /\bport\s+(?:80|443|22|8080|8443|3000|3001|5432|27017)\b/i,
  // Standard AWS region references in documentation (not secrets)
  /\b(?:us|eu|ap|sa|ca|me|af)-(?:central|east|west|south|north|northeast|southeast)-\d\b/i,
];

/**
 * Returns true if all regex matches in the response for a given pattern
 * are covered by the allowlist (i.e., they are known-safe values).
 */
function isAllowlisted(responsePayload: string, patternSource: string, patternFlags: string): boolean {
  const regex = new RegExp(patternSource, patternFlags);
  let match: RegExpExecArray | null;
  const matches: string[] = [];

  while ((match = regex.exec(responsePayload)) !== null) {
    matches.push(match[0]);
    // Prevent infinite loop on zero-length matches
    if (match[0].length === 0) regex.lastIndex++;
  }

  if (matches.length === 0) return true; // no matches = nothing to allowlist

  // Check if EVERY match is covered by at least one allowlist entry
  return matches.every(m =>
    DLP_ALLOWLIST.some(allow => allow.test(m))
  );
}


export async function runDlpFilter(responsePayload: string): Promise<DefenseVerdict> {
  let isLeaking = false;
  const caughtPatterns: string[] = [];

  for (const patternDef of SECRET_PATTERN_DEFS) {
    // Create a fresh RegExp instance each time to avoid lastIndex stickiness
    const regex = new RegExp(patternDef.source, patternDef.flags);
    if (regex.test(responsePayload)) {
      // Check if all matches are covered by the allowlist
      if (isAllowlisted(responsePayload, patternDef.source, patternDef.flags)) {
        continue; // All matches are known-safe — skip this pattern
      }
      isLeaking = true;
      if (!caughtPatterns.includes(patternDef.name)) {
        caughtPatterns.push(patternDef.name);
      }
    }
  }

  // Determine block logic
  const triggered = isLeaking;
  
  if (triggered) {
    // We deterministically block on regex matches
    return {
      defenseId: 'dlp-filter',
      defenseName: 'Data Loss Prevention (DLP) Filter',
      triggered: true,
      confidence: 100, // Deterministic matching is always 100% confidence
      details: `Data Exfiltration Blocked. The response contained patterns matching known secrets or PII: ${caughtPatterns.join(', ')}`,
      blocked: true
    };
  }

  // Not triggered
  return {
    defenseId: 'dlp-filter',
    defenseName: 'Data Loss Prevention (DLP) Filter',
    triggered: false,
    confidence: 0,
    details: 'No sensitive data patterns detected in response.',
    blocked: false
  };
}
