# Capstone documentation bundle

Supporting material for the Thrax security evaluation platform: design notes, exported metrics, and reproducible benchmark commands.

| File | Purpose |
|------|---------|
| [`AttackLogic.md`](./AttackLogic.md) | Attack-side design notes |
| [`DefenseLogic.md`](./DefenseLogic.md) | Defense-side design notes |
| [`evaluation-results.md`](./evaluation-results.md) | Stress-test metrics for thesis Sections 7.3–7.4 (Tables 7.1–7.3) |
| [`user-survey.md`](./user-survey.md) | User survey demographics and results (N = 56) |

**Regenerate evaluation tables** (from repo root, with backend env configured):

```bash
cd backend
doppler run -- npx tsx scripts/run-capstone-benchmark.ts --mode undefended --iterations 50
doppler run -- npx tsx scripts/run-capstone-benchmark.ts --mode full-pipeline --iterations 50
doppler run -- npx tsx scripts/print-capstone-tables.ts
```

For run instructions and architecture, start at the [root README](../../README.md) and [`docs/setup.md`](../setup.md).
