export class DocumentScanner {
  public extractTags(text: string): string[] {
    const tags = new Set<string>();

    // Financial: Currency, IBANs, Credit Cards (basic), and common accounting/finance terms
    if (
      /\b\$[0-9,]+(\.[0-9]{2})?\b/.test(text) ||
      /\b(€|£|¥)[0-9,]+(\.[0-9]{2})?\b/.test(text) ||
      /\b(?:[A-Z]{2}[0-9]{2})(?:[ ]?[0-9a-zA-Z]{4}){3,5}(?:[ ]?[0-9a-zA-Z]{1,3})?\b/.test(text) || // Basic IBAN
      /\b(?:\d{4}[ -]?){3}\d{4}\b/.test(text) || // Generic Credit Card pattern
      /\b(budget|variance|revenue|ebitda|invoice|tax|salary|payroll|capital expenditure|capex|profit|loss)\b/i.test(text)
    ) {
      tags.add('FINANCIAL');
    }
    
    // APIs: Specific vendor keys, JWTs, standard auth tokens
    if (
      /\b(AKIA|ASIA)[0-9A-Z]{16}\b/.test(text) || // AWS Access Key
      /\bgh[pousr]_[a-zA-Z0-9]{36}\b/.test(text) || // GitHub Token
      /\b(sk|pk)_(test|live)_[0-9a-zA-Z]{24,}\b/.test(text) || // Stripe Key
      /\bxox[baprs]-[0-9]{10,}-[a-zA-Z0-9]{24}\b/.test(text) || // Slack Token
      /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\b/.test(text) || // JWT Token
      /bearer\s+[a-zA-Z0-9\-\._~\+\/]+=*/i.test(text) ||
      /\b(api key|endpoint|webhook|rest api|graphql|client_secret|client_id)\b/i.test(text)
    ) {
      tags.add('APIS');
    }

    // Credentials: Passwords, DB Connection strings, RSA/PGP keys
    if (
      /(password|passwd|pwd|secret|auth_token)\s*[=:]\s*["']?\S+["']?/i.test(text) ||
      /(mongodb(\+srv)?|postgres(ql)?|mysql|redis):\/\/[a-zA-Z0-9_-]+:[^@\s]+@[a-zA-Z0-9.-]+/i.test(text) || // DB Connection string
      /https?:\/\/[a-zA-Z0-9_-]+:[^@\s]+@[a-zA-Z0-9.-]+/i.test(text) || // Basic Auth URLs
      /-----BEGIN (RSA |DSA |EC |OPENSSH |PGP )?(PRIVATE KEY|MESSAGE)-----/i.test(text) || // Private Keys
      /\b(connectionstring|db_pass|\.env|credentials)\b/i.test(text)
    ) {
      tags.add('CREDENTIALS');
    }

    // PII (Personally Identifiable Information)
    if (
      /\b\d{3}-\d{2}-\d{4}\b/.test(text) || // SSN
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/.test(text) || // Email
      /\b(?:\+?1[-.\u25CF]?)?\(?([0-9]{3})\)?[-.\u25CF]?([0-9]{3})[-.\u25CF]?([0-9]{4})\b/.test(text) || // Phone (US generic)
      /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/.test(text) || // IPv4
      /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/.test(text) || // IPv6
      /\b(ssn|employee #|date of birth|dob|driver'?s license|passport)\b/i.test(text)
    ) {
      tags.add('PII');
    }

    // Infrastructure: Cloud, servers, networking, deployment
    if (
      /\b(ec2|s3|lambda|vpc|subnet|cidr|kubernetes|k8s|docker|nginx|apache|load balancer)\b/i.test(text) ||
      /\b(terraform|ansible|cloudformation|helm|istio|envoy)\b/i.test(text) ||
      /\b(bastion|jump server|ssh|rdp|vpn|firewall|dns zone|cname|a record)\b/i.test(text) ||
      /\b(ci\/cd|jenkins|github actions|gitlab|argocd|artifact registry)\b/i.test(text) ||
      /\b(failover|disaster recovery|rto|rpo|backup|replication)\b/i.test(text) ||
      /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}\b/.test(text) // CIDR notation
    ) {
      tags.add('INFRASTRUCTURE');
    }

    // Legal & Compliance: Contracts, NDAs, regulatory references
    if (
      /\b(gdpr|hipaa|sox|pci[- ]dss|ccpa|ferpa|fcra|dodd-frank|sarbanes|regulation)\b/i.test(text) ||
      /\b(non-disclosure|nda|confidentiality agreement|indemnification|liability cap)\b/i.test(text) ||
      /\b(compliance|audit finding|consent order|enforcement action|regulatory filing)\b/i.test(text) ||
      /\b(data processing agreement|data controller|data processor|subprocessor)\b/i.test(text) ||
      /\b(contract|amendment|clause|section \d+\.\d+|governing law|arbitration)\b/i.test(text)
    ) {
      tags.add('LEGAL_COMPLIANCE');
    }

    // Strategic: M&A, competitive intelligence, board decisions
    if (
      /\b(acquisition|merger|takeover|divestiture|IPO|fundraising|valuation)\b/i.test(text) ||
      /\b(competitive analysis|market share|go-to-market|product roadmap|launch date)\b/i.test(text) ||
      /\b(board resolution|board meeting|shareholder|investor|series [a-f])\b/i.test(text) ||
      /\b(restructuring|layoff|rif|reduction in force|office consolidation)\b/i.test(text) ||
      /\b(trade secret|proprietary|confidential.*strategy|pricing strategy)\b/i.test(text)
    ) {
      tags.add('STRATEGIC');
    }

    // HR / Internal: Performance, compensation, disciplinary
    if (
      /\b(performance review|performance improvement plan|pip|disciplinary action)\b/i.test(text) ||
      /\b(salary band|compensation|bonus pool|equity refresh|stock option)\b/i.test(text) ||
      /\b(termination|separation agreement|severance|exit interview)\b/i.test(text) ||
      /\b(harassment|discrimination|complaint|investigation|whistleblower)\b/i.test(text) ||
      /\b(succession planning|org chart|headcount|open requisition|promotion)\b/i.test(text)
    ) {
      tags.add('HR_INTERNAL');
    }

    // Supply Chain: Vendor, procurement, logistics
    if (
      /\b(purchase order|procurement|vendor agreement|supplier|logistics)\b/i.test(text) ||
      /\b(bill of materials|bom|lead time|safety stock|reorder point)\b/i.test(text) ||
      /\b(sole source|single supplier|tariff|customs|import|export control)\b/i.test(text) ||
      /\b(warehouse|distribution center|freight|carrier|shipping route)\b/i.test(text) ||
      /\b(commodity hedge|volume discount|payment terms|net \d{2,3})\b/i.test(text)
    ) {
      tags.add('SUPPLY_CHAIN');
    }

    // Security Operations: Pentests, incident response, vulnerabilities
    if (
      /\b(penetration test|pentest|red team|blue team|threat hunt|incident response)\b/i.test(text) ||
      /\b(cve-\d{4}-\d{4,}|cvss|vulnerability scan|exploit|zero-day)\b/i.test(text) ||
      /\b(siem|edr|waf|ids|ips|soar|soc analyst|threat intelligence)\b/i.test(text) ||
      /\b(ioc|indicator of compromise|malware|ransomware|phishing|breach)\b/i.test(text) ||
      /\b(privileged access|pam|credential rotation|mfa|rbac|least privilege)\b/i.test(text)
    ) {
      tags.add('SECURITY_OPS');
    }

    if (tags.size === 0) {
      tags.add('GENERIC');
    }

    return Array.from(tags);
  }
}

export const documentScanner = new DocumentScanner();
