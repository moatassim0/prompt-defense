# Quantitative evaluation results (Sections 7.3–7.4)

**Source:** Persisted stress-test traces in PostgreSQL (`test_runs`, `test_results`, `metrics`). Metrics below are computed from all stored undefended runs (no active defenses) and full seven-mechanism pipeline runs (`encoding-detector`, `semantic-trigger-detector`, `canary-word`, `prompt-sandwiching`, `llm-judge`, `dlp-filter`, `turn-tracker`).

**Model:** Cerebras `llama3.1-8b` (via Doppler-injected `CEREBRAS_API_KEY`).  
**Success criterion:** An iteration counts as a successful injection when the multi-signal evaluator (`stress-test-eval.service.ts`) marks `attackSucceeded = true` (injection echo / compliance confirmation detected in the model output).  
**Regenerate tables:** `cd backend && doppler run -- npx tsx scripts/print-capstone-tables.ts`

---

## 7.3 Attack Effectiveness (Undefended)

The undefended configuration provides the baseline showing how vulnerable the model is to each attack category when no defenses are active. These results demonstrate the severity of the threat and justify the need for the layered defense pipeline.

### Table 7.1: Undefended Attack Success Rates

| Attack Category | Iterations | Successful Injections | ASR | Severity |
|---|---:|---:|---:|---|
| Indirect Injection | 211 | 94 | 44.5% | Advanced |
| Fabricated Session History | 3 | 2 | 66.7% | Advanced |
| Semantic Backdoor | 49 | 35 | 71.4% | Advanced |
| Context Overflow | 10 | 6 | 60.0% | Intermediate |
| Payload Splitting | 3 | 2 | 66.7% | Intermediate |
| Base64 Encoding | 60 | 10 | 16.7% | Intermediate |

> **Note on sample sizes:** Indirect injection, semantic backdoor, and Base64 encoding were exercised across multiple 10–50 iteration stress batches. Fabricated session history, context overflow, and payload splitting undefended baselines currently have smaller stored samples (3–10 iterations each); re-run with `scripts/run-capstone-benchmark.ts --mode undefended --iterations 50` to expand those rows.

The general pattern observed in these results matches the literature: semantically sophisticated attacks with no explicit override commands—indirect injection (44.5% ASR), fabricated session history (66.7%), and semantic backdoor (71.4%)—achieve higher undefended ASR than encoding-based attacks (16.7% Base64), because the latter still produce patterns that the model's alignment training partially recognises even without dedicated detection logic. Context overflow (60.0% ASR) exploits the well-documented tendency of LLMs to give less attention to content buried in the middle of large documents.

---

## 7.4 Defense Pipeline Effectiveness

The defended configuration shows how the seven-mechanism pipeline reduces attack success. Table 7.2 compares defended ASR to the undefended baseline. Table 7.3 shows the detection rate per defense mechanism across all full-pipeline iterations stored in the database.

### Table 7.2: Defended vs Undefended ASR Comparison

| Attack Category | Undefended ASR | Defended ASR | Reduction |
|---|---:|---:|---:|
| Indirect Injection | 44.5% | 1.5% | 43.0 pp |
| Fabricated Session History | 66.7% | 4.8% | 61.9 pp |
| Semantic Backdoor | 71.4% | 3.1% | 68.3 pp |
| Context Overflow | 60.0% | 0.0% | 60.0 pp |
| Payload Splitting | 66.7% | 8.2% | 58.5 pp |
| Base64 Encoding | 16.7% | 0.0% | 16.7 pp |

*Defended ASR = attack success rate when all seven pipeline mechanisms are active. Reduction = undefended ASR minus defended ASR (percentage points).*

### Table 7.3 — Per-Defense Detection Rates

| Defense Mechanism | Stage | Primary Attack Targeted | Iterations | Triggered | Detection Rate |
|---|---|---|---:|---:|---:|
| Encoding Detector | Input | Base64 Encoding | 236 | 20 | 8.5% |
| Semantic Trigger Detector | Input | Indirect Injection, Semantic Backdoor | 236 | 135 | 57.2% |
| Canary Word Injection | Input | Payload Splitting, Context Overflow | 236 | 4 | 1.7% |
| Prompt Sandwiching | Input | All categories | 236 | 0 | 0.0% |
| LLM Judge | Output | All categories | 236 | 28 | 11.9% |
| DLP Filter | Output | Data exfiltration payloads | 236 | 0 | 0.0% |
| Session Turn Tracker | Output | Fabricated Session History | 236 | 1 | 0.4% |

*Detection rate = share of full-pipeline iterations where the mechanism logged a block/flag/warn verdict. Prompt sandwiching is a structural hardening layer and does not emit standalone trigger verdicts. DLP filter triggers only on exfiltration-shaped output, which these governance-framed attacks rarely produce.*

The key finding from these results is that no single mechanism achieves comprehensive protection across all six attack categories. The encoding detector is highly effective against Base64 attacks (defended ASR drops from 16.7% to 0.0%) but has limited impact on attacks that use no encoding (semantic trigger detector carries most of the load at 57.2% trigger rate on indirect/backdoor documents). The semantic trigger detector catches indirect and backdoor attacks but is less relevant for context overflow, which relies on attention degradation rather than explicit trigger patterns. The LLM judge provides the broadest output-side coverage (11.9% trigger rate) because it evaluates the response signal rather than the input structure, making it effective against any attack that produces a recognisable compliance echo in the response.

After hardening, the semantic trigger detector began catching attacks it had previously missed once the citation gate was removed and twelve additional bypass patterns were added. The session turn tracker had been inoperative for the length-decrease signal since it was first built; its 0.4% trigger rate in this dataset reflects the remaining signals only. The encoding detector's expansion from five to twenty-five keyword patterns increased its coverage of the corporate-synonym payloads the fuzzer produces (8.5% trigger rate across the full-pipeline corpus, with 0% defended ASR on Base64 in stored runs).
