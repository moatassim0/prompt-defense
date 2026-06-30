# THRAX — Project map (where to find everything)

Use this when someone asks *“where is X?”* — open the path, not a random search.

---

## Quick lookup

| I need… | Go here |
|--------|---------|
| **Attack definitions (built-in)** | [`shared/attacks.ts`](shared/attacks.ts) |
| **Attack CRUD / DB access** | [`backend/src/services/attack.service.ts`](backend/src/services/attack.service.ts) |
| **Attack library UI (admin)** | [`frontend/src/components/AttacksPage.tsx`](frontend/src/components/AttacksPage.tsx) |
| **Defense definitions (seed list)** | [`shared/defenses.ts`](shared/defenses.ts) |
| **Defense pipeline (orchestrator)** | [`backend/src/services/defense/defense-pipeline.service.ts`](backend/src/services/defense/defense-pipeline.service.ts) |
| **Individual defense modules** | [`backend/src/services/defense/`](backend/src/services/defense/) |
| **Defense config UI (admin)** | [`frontend/src/components/DefensesPage.tsx`](frontend/src/components/DefensesPage.tsx) |
| **Database schema / migrations** | [`backend/src/db/migrate.ts`](backend/src/db/migrate.ts) + [`database/schema.sql`](database/schema.sql) |
| **DB connection pool** | [`backend/src/config/database.ts`](backend/src/config/database.ts) |
| **Test runs / results queries** | [`backend/src/services/database.service.ts`](backend/src/services/database.service.ts) |
| **Frontend (all pages)** | [`frontend/src/components/`](frontend/src/components/) |
| **App routing / which page loads** | [`frontend/src/App.tsx`](frontend/src/App.tsx) |
| **API calls from browser** | [`frontend/src/services/api.ts`](frontend/src/services/api.ts) |
| **Backend entry / all routes** | [`backend/src/server.ts`](backend/src/server.ts) |
| **Auth middleware + user admin API** | [`backend/src/auth.ts`](backend/src/auth.ts) |
| **Better Auth config** | [`backend/src/lib/better-auth.ts`](backend/src/lib/better-auth.ts) |
| **LLM API client** | [`backend/src/services/llm.service.ts`](backend/src/services/llm.service.ts) |
| **Chat UI** | [`frontend/src/components/ChatInterface.tsx`](frontend/src/components/ChatInterface.tsx) |
| **Documents + InfoBank UI** | [`frontend/src/components/DocumentsPage.tsx`](frontend/src/components/DocumentsPage.tsx) |
| **Threat Intel Center (Simulator)** | [`frontend/src/components/Simulator.tsx`](frontend/src/components/Simulator.tsx) |
| **Stress test UI** | [`frontend/src/components/TestingPage.tsx`](frontend/src/components/TestingPage.tsx) |
| **Stress test API + SSE** | [`backend/src/controllers/testing.controller.ts`](backend/src/controllers/testing.controller.ts) |
| **Analytics dashboard** | [`frontend/src/components/AnalyticsPage.tsx`](frontend/src/components/AnalyticsPage.tsx) |
| **Test traces** | [`frontend/src/components/TestTracesPage.tsx`](frontend/src/components/TestTracesPage.tsx) |
| **User management** | [`frontend/src/components/UserManagementPage.tsx`](frontend/src/components/UserManagementPage.tsx) |
| **Login page** | [`frontend/src/components/LoginPage.tsx`](frontend/src/components/LoginPage.tsx) |
| **InfoBank fixture files** | [`InfoBank/clean/`](InfoBank/clean/) and [`InfoBank/poisoned/`](InfoBank/poisoned/) |
| **InfoBank manifest (trigger queries)** | [`shared/infobank-manifest.ts`](shared/infobank-manifest.ts) |
| **In-memory document store (per user)** | [`backend/src/services/document.service.ts`](backend/src/services/document.service.ts) |
| **Shared types (frontend + backend)** | [`shared/types.ts`](shared/types.ts) |
| **Environment variables template** | [`backend/env.example`](backend/env.example) |
| **Capstone benchmark scripts** | [`backend/scripts/run-capstone-benchmark.ts`](backend/scripts/run-capstone-benchmark.ts) |
| **Regenerate thesis tables** | [`backend/scripts/print-capstone-tables.ts`](backend/scripts/print-capstone-tables.ts) |
| **Evaluation results (docs)** | [`docs/capstone/evaluation-results.md`](docs/capstone/evaluation-results.md) |
| **Setup / run instructions** | [`docs/setup.md`](docs/setup.md) |
| **Full technical reference** | [`PROJECT_DOCUMENTATION.md`](PROJECT_DOCUMENTATION.md) |

---

## Top-level folders

```
llmproto-VisualChanges_Sambosa/
├── frontend/          ← React UI (what you see in the browser)
├── backend/           ← Express API, auth, defenses, LLM, DB
├── shared/            ← Types, attacks, defenses (used by BOTH frontend & backend)
├── InfoBank/          ← Pre-built .txt test documents (clean + poisoned)
├── database/          ← SQL schema reference
├── docs/              ← Setup, architecture, capstone notes
├── testing/framework/ ← Metrics collector + test-runner helpers
└── PROJECT_MAP.md     ← This file
```

---

## Frontend (`frontend/`)

| Folder / file | What's inside |
|---------------|---------------|
| [`src/App.tsx`](frontend/src/App.tsx) | Page switching, admin vs user nav, data bootstrap |
| [`src/components/`](frontend/src/components/) | **All main screens** (one file ≈ one page) |
| [`src/components/ui/`](frontend/src/components/ui/) | Reusable UI pieces (buttons, dialogs, tables) |
| [`src/services/api.ts`](frontend/src/services/api.ts) | Every `fetch` / Axios call to `/api/...` |
| [`src/context/AuthContext.tsx`](frontend/src/context/AuthContext.tsx) | Logged-in user state |
| [`src/lib/`](frontend/src/lib/) | Helpers (errors, exports, auth client) |
| [`vite.config.ts`](frontend/vite.config.ts) | Dev server port **3000**, proxy `/api` → backend |
| [`public/`](frontend/public/) | Static assets (logo, favicon) |

### Page → file

| Screen in app | File |
|---------------|------|
| Login | `LoginPage.tsx` |
| Chat | `ChatInterface.tsx` |
| Documents + InfoBank | `DocumentsPage.tsx` |
| Attacks (admin) | `AttacksPage.tsx` |
| Defenses (admin) | `DefensesPage.tsx` |
| Threat Intel Center | `Simulator.tsx` |
| Stress Test | `TestingPage.tsx` |
| Test Traces | `TestTracesPage.tsx` |
| Analytics | `AnalyticsPage.tsx` |
| Users (admin) | `UserManagementPage.tsx` |
| Help (`?` button) | `HelpPanel.tsx` |
| Shell / sidebar | `AppShell.tsx` |

---

## Backend (`backend/`)

| Folder / file | What's inside |
|---------------|---------------|
| [`src/server.ts`](backend/src/server.ts) | **Start here for routes**: chat, simulator, documents, InfoBank load |
| [`src/auth.ts`](backend/src/auth.ts) | `authenticateToken`, `requireAdmin`, user CRUD routes |
| [`src/controllers/testing.controller.ts`](backend/src/controllers/testing.controller.ts) | Stress test SSE, analytics API, test traces |
| [`src/controllers/jobs.controller.ts`](backend/src/controllers/jobs.controller.ts) | Async job cancel / status |
| [`src/services/`](backend/src/services/) | Business logic |
| [`src/services/defense/`](backend/src/services/defense/) | **All 7 defenses + pipeline** |
| [`src/db/migrate.ts`](backend/src/db/migrate.ts) | Tables, seeds (users, attacks, defenses) |
| [`src/config/database.ts`](backend/src/config/database.ts) | Postgres pool |
| [`scripts/`](backend/scripts/) | Capstone benchmark + table export |
| [`env.example`](backend/env.example) | Required env vars |

### Defense modules (one file each)

| Defense | File |
|---------|------|
| Pipeline orchestrator | `defense-pipeline.service.ts` |
| Encoding detector | `encoding-detector.service.ts` |
| Semantic trigger | `semantic-trigger-detector.service.ts` |
| Canary word | `canary-word.service.ts` |
| Prompt sandwiching | `prompt-sandwiching.service.ts` |
| LLM judge | `llm-judge.service.ts` |
| DLP filter | `dlp-filter.service.ts` |
| Turn tracker | `turn-tracker.service.ts` |
| Stress-test scoring | `stress-test-eval.service.ts` |

---

## Shared (`shared/`)

Used by **both** frontend and backend — change here affects the whole app.

| File | Purpose |
|------|---------|
| [`types.ts`](shared/types.ts) | Document, Attack, Defense, Simulator, test types |
| [`attacks.ts`](shared/attacks.ts) | Built-in attack payloads + `createPoisonedDocument` / fuzzer |
| [`defenses.ts`](shared/defenses.ts) | Seed defenses + `DefensePipelineResult` type |
| [`constants.ts`](shared/constants.ts) | Hardened system prompt, shared strings |
| [`infobank-manifest.ts`](shared/infobank-manifest.ts) | InfoBank fixture list + trigger queries |
| [`simulation-prompts.ts`](shared/simulation-prompts.ts) | Simulator prompt helpers |

---

## Database

| What | Where |
|------|--------|
| **Migration + seed code** | [`backend/src/db/migrate.ts`](backend/src/db/migrate.ts) |
| **SQL reference** | [`database/schema.sql`](database/schema.sql) |
| **Query helpers** | [`backend/src/services/database.service.ts`](backend/src/services/database.service.ts) |

### Main tables (created by migrations)

| Table | Stores |
|-------|--------|
| `users`, `session`, `account` | Auth (Better Auth) |
| `attacks` | Attack library (built-in + custom) |
| `defenses` | Defense toggle state |
| `test_runs` | Stress test sessions |
| `test_results` | Each iteration (prompt, response, score) |
| `metrics` | Aggregated ASR / F1 / effectiveness |
| `async_jobs` | Long-running stress test job status |
| `audit_log`, `login_events` | Security audit |

**Note:** Uploaded documents are **in-memory per `userId`** (`document.service.ts`), not the SQL `documents` table at runtime. Sign out or switch accounts to see an isolated library; restart the backend to wipe all in-memory docs.

---

## InfoBank (test documents)

| Folder | Contents |
|--------|----------|
| [`InfoBank/clean/`](InfoBank/clean/) | 5 baseline corporate `.txt` files |
| [`InfoBank/poisoned/`](InfoBank/poisoned/) | 6 attack fixture `.txt` files |
| [`shared/infobank-manifest.ts`](shared/infobank-manifest.ts) | Names, descriptions, **trigger queries** |

---

## Docs (`docs/`)

| File | Purpose |
|------|---------|
| [`setup.md`](docs/setup.md) | Install, Doppler, Neon, run dev servers |
| [`architecture.md`](docs/architecture.md) | Architecture notes |
| [`testing_framework.md`](docs/testing_framework.md) | How stress testing / metrics work |
| [`capstone/README.md`](docs/capstone/README.md) | Capstone bundle index |
| [`capstone/evaluation-results.md`](docs/capstone/evaluation-results.md) | ASR tables for thesis |
| [`capstone/AttackLogic.md`](docs/capstone/AttackLogic.md) | Attack design reference |
| [`capstone/DefenseLogic.md`](docs/capstone/DefenseLogic.md) | Defense design reference |

---

## Common “show me in the demo” paths

1. **Attacks** → UI: `AttacksPage.tsx` → data: `shared/attacks.ts` + DB `attacks` table  
2. **Defenses** → UI: `DefensesPage.tsx` → logic: `backend/src/services/defense/`  
3. **Run a simulation** → UI: `Simulator.tsx` → API: `server.ts` `/api/simulator`  
4. **Run stress test** → UI: `TestingPage.tsx` → API: `testing.controller.ts`  
5. **See results** → UI: `AnalyticsPage.tsx` / `TestTracesPage.tsx` → DB: `test_results`, `metrics`  
6. **Database** → `backend/src/db/migrate.ts` + Neon dashboard for live data  
7. **Frontend look & feel** → `frontend/src/components/` + `index.css` / `tailwind.config.ts`

---

## Run commands (reminder)

```bash
# Terminal 1 — API (port 3001)
cd backend && doppler run -- npm run dev

# Terminal 2 — UI (port 3000)
cd frontend && npm run dev
# Open http://localhost:3000
```
