# Testing Framework & Methodologies

The LLM Security Testing Platform enables quantitative penetration testing and vulnerability analysis of major LLM providers using tiered attacks and active defenses.

## 1. Attack Vectors (Three Tiers)

Attacks are stored in the Neon database and classified by technical sophistication.

| Tier | Example | Description |
|---|---|---|
| **Tier 1 (Basic)** | Direct Command Injection | Explicitly instructing the LLM to ignore prior instructions and execute a new command. Highly noticeable. |
| **Tier 2 (Intermediate)** | Context Overflow | Flooding the context window with useless noise before dropping a payload at the edge of the attention mechanism. |
| **Tier 3 (Advanced)** | Payload Splitting | Fragmenting malevolent requests across variables to avoid regex filtering and DLP analysis. |

*Developers Note:* The database comes pre-seeded with 5 attacks spread across these 3 tiers.

## 2. Active Defenses

Administrators can toggle layers of defense on or off during the Simulation and Stress Testing workflows:

1. **System Prompt Hardening**: Surrounding user queries with strict behavioral boundaries.
2. **Prompt Sandwiching**: Using dual-layer delimiters (both front and back) to trap malicious content inside harmless containers.
3. **Data Loss Prevention (DLP)**: An exact-match analysis tool that scans LLM egress payloads and scrubs PII, API tokens, and IBANs before it hits the application.
4. **Encoding Detector**: Scans incoming Base64, Hexadecimal, and ROT13 text to decode potential hidden adversarial payloads before routing them to the model.

## 3. Multi-Signal Defense Evaluation (The LLM Judge)

We do not rely entirely on rigid regex to determine if an attack "worked." Instead, the platform generates a layered, multi-signal vulnerability score via `stress-test-eval.service.ts`:

1. **Pipeline Block Detection**: Was the query outright denied by safety filters before processing?
2. **Injection Echoing**: Did the LLM inadvertently reflect the malicious token strings back into the response?
3. **LLM Judge Evaluation**: A strict deterministic LLM (configured as a strict security analyst) grades the output context against a secure benchmark and scores it out of 10. `1-4` is an undeniable vulnerability.

This creates the overarching **Effectiveness Leaderboard** found on the Analytics page.
