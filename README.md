# THRAX — LLM prompt injection security lab

Research-oriented full-stack platform for **tiered prompt-injection attacks**, **multi-layer defenses**, and **automated evaluation** (including stress testing and metrics) against a live LLM backend.

> **Looking for a specific folder or file?** See **[`PROJECT_MAP.md`](./PROJECT_MAP.md)** — quick table: attacks → `shared/attacks.ts`, database → `backend/src/db/migrate.ts`, frontend pages → `frontend/src/components/`, etc.

## What it does

- Simulates and catalogs attacks while orchestrating defense pipelines (encoding checks, semantic triggers, canary words, sandwiching, LLM judge, DLP, session tracking, and more).
- Uploads and scans **InfoBank** documents (clean vs poisoned fixtures) to exercise retrieval and injection scenarios — each account has its **own** document library; sign-out clears the UI before the next login.
- Persists test runs, results, and analytics in **PostgreSQL (Neon)**.
- Ships with a **React + Vite** dashboard for chat, documents, testing, analytics, and admin flows.

## Main features

- Attack library and defense configuration aligned in shared TypeScript (`shared/`)
- Defense pipeline and LLM integration on **Express**
- **Better Auth** session-based access control with **per-account document libraries** (server-scoped by `userId`; client state cleared on sign-out / account switch)
- Programmatic DB migrations and seeds (including default lab accounts)
- Stress-testing API with streaming/progress feedback and metrics export concepts (see `docs/testing_framework.md`)
- **Stress Test** result stream **auto-scrolls only while you stay near the bottom** of the pane, so you can scroll up to stop or inspect rows during long batches
- **Stress Test** iterations field supports typed values **1–500** (draft input committed on blur or Run)
- **Test Traces** defaults to the **latest saved run**, supports **all traces** with **per-run group headers** on each page, chronological order **within** a selected run, and a **compact searchable run picker** (not a long native dropdown)
- **Simulator** and **Stress Test** offer in-browser **JSON** and **CSV** exports of the current run (scenario + outputs / per-iteration rows) for offline review
- **Clearer API feedback** in the UI: timeouts, rate limits, upstream errors, and session expiry map to specific toasts and inline messages where applicable
- **`?` Help** includes per-page steps and a **Responsible use** appendix at the bottom of the sheet (scroll-safe layout so steps are not covered)

## Tech stack

| Layer | Technology |
|--------|------------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, Radix UI, TanStack Table, Recharts |
| Backend | Node.js, Express, TypeScript, `pg`, Better Auth, Zod |
| Database | PostgreSQL (Neon) |
| LLM | Cerebras API (primary); optional keys for alternate providers (`backend/env.example`) |
| Secrets | **Doppler** (recommended) or local `backend/.env` |

### Per-account UI state (browser)

Theme choice and chat session history are stored in **`localStorage` keyed by signed-in user id** (e.g. `thrax_theme_<userId>`, `thrax_chat_sessions_<userId>`). The **document library** is scoped the same way on the server (`document.service.ts` per `userId`); **`App.tsx` clears in-memory React document state on sign-out and account switch** before refetching. Logging out resets the login screen to dark mode and schedules a **fresh empty chat** on next sign-in while keeping older threads in the sidebar for that account.

## Prerequisites

- **Node.js 18+**
- **Neon** (or compatible Postgres) connection string
- **Cerebras** API key for full LLM functionality
- **[Doppler CLI](https://docs.doppler.com/docs/install-cli)** if you use the Doppler workflow

## Setup

### 1. Install dependencies

Install **per package** (there is no root `npm install` workspace):

```bash
cd backend && npm install
cd ../frontend && npm install
```

Optional helper (Git Bash / WSL):

```bash
./dopplersetup.sh install
```

### 2. Environment variables

**Template:** copy `backend/env.example` and fill in real values:

```bash
cp backend/env.example backend/.env
```

**Recommended (Doppler):** follow **[`docs/setup.md`](./docs/setup.md)** — login, link the project, and run the backend with secrets injected:

```bash
cd backend
doppler run -- npm run dev
```

Important keys (see `backend/env.example` for the full list):

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon Postgres connection string |
| `CEREBRAS_API_KEY` | LLM calls |
| `CEREBRAS_BASE_URL` | API base (default in template) |
| `LLM_MODEL` | Model id |
| `PORT` | API port (default **3001**) |
| `FRONTEND_URL` | CORS origin (default `http://localhost:3000`) |
| `BETTER_AUTH_URL` | Public API base URL for Better Auth (dev default `http://localhost:3001`) |
| `AUTH_RATE_LIMIT_MAX` | Optional override for `/api/auth/*` rate limit (see `backend/env.example`) |
| `AUTH_RATE_LIMIT_DISABLED` | Set to `1` to disable auth rate limiting (local debugging only) |
| `DB_DEBUG_QUERIES` | Optional: `1` for verbose SQL / pool logs (default off) |

Optional provider keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.) appear in the template for experiments; the shipped **`llm.service`** path uses **Cerebras** (OpenAI-compatible `/chat/completions`) unless you extend it.

### 3. Database

Migrations run on server startup; you can also run them explicitly:

```bash
cd backend
npx tsx src/db/migrate.ts
```

## How to run

**Terminal 1 — backend**

```bash
cd backend
# With Doppler:
doppler run -- npm run dev
# Or with local .env (dotenv loads automatically):
npm run dev
```

**Terminal 2 — frontend**

```bash
cd frontend
npm run dev
```

- **App:** [http://localhost:3000](http://localhost:3000)  
- **API:** [http://localhost:3001](http://localhost:3001) (per `PORT`)

Production-style backend after build:

```bash
cd backend
npm run build
npm start
```

## Demo login (seeded accounts)

After migrations/seeds (see `docs/setup.md`):

| Role | Email | Password |
|------|--------|----------|
| Super admin | `superadmin@lab.com` | `superadmin1234` |
| Admin | `admin@lab.com` | `admin1234` |
| User | `user@lab.com` | `user1234` |

Regular **`user`** accounts see **Chat** and **Documents** only (prompt-injection sandbox copy + InfoBank). **Admin / super_admin** unlock the full lab (attacks, defenses, simulator, stress test, analytics, users).

## Project structure (overview)

```text
├── backend/           # Express API, auth, defense pipeline, migrations
├── frontend/          # Vite + React UI (`src/`, static assets in `public/`)
├── shared/            # Types, attacks, defenses, prompts, constants
├── InfoBank/          # Clean / poisoned text fixtures for document testing
├── testing/framework/ # Shared test-runner utilities (compiled with backend)
├── database/          # Reference `schema.sql`
├── docs/              # Setup, architecture, testing framework, capstone bundle
│   └── capstone/      # Evaluation tables, attack/defense design notes
├── backend/scripts/   # Capstone benchmark + metrics export utilities
├── PROJECT_DOCUMENTATION.md   # Full technical reference
├── PROJECT_MAP.md             # Quick "where is X?" navigation guide
```

## Documentation index

| Doc | Description |
|-----|-------------|
| **[`PROJECT_MAP.md`](./PROJECT_MAP.md)** | **Where to find everything** (attacks, DB, frontend, defenses, …) |
| [`docs/setup.md`](./docs/setup.md) | Doppler, Neon, run commands |
| [`docs/architecture.md`](./docs/architecture.md) | System architecture |
| [`docs/testing_framework.md`](./docs/testing_framework.md) | Testing / metrics concepts |
| [`docs/capstone/README.md`](./docs/capstone/README.md) | Capstone bundle index |
| [`docs/capstone/evaluation-results.md`](./docs/capstone/evaluation-results.md) | Stress-test ASR tables (Sections 7.3–7.4) |
| [`docs/capstone/AttackLogic.md`](./docs/capstone/AttackLogic.md) | Attack-side design reference |
| [`docs/capstone/DefenseLogic.md`](./docs/capstone/DefenseLogic.md) | Defense pipeline reference |
| [`PROJECT_DOCUMENTATION.md`](./PROJECT_DOCUMENTATION.md) | Full technical reference |

## Safety and ethics

> **Warning:** This codebase implements real adversarial patterns. Use only on systems and API accounts you are authorized to test. Do not expose the dashboard to the public internet without strict isolation and review.

Short **Responsible use** copy also appears in the **Help** panel (`?`) after the step-by-step guidance for the current page.

## Capstone evaluation (optional)

Reproducible stress-test metrics for thesis tables:

```bash
cd backend
doppler run -- npx tsx scripts/run-capstone-benchmark.ts --mode undefended --iterations 50
doppler run -- npx tsx scripts/run-capstone-benchmark.ts --mode full-pipeline --iterations 50
doppler run -- npx tsx scripts/print-capstone-tables.ts
```

See [`docs/capstone/evaluation-results.md`](./docs/capstone/evaluation-results.md) for exported table definitions.

## Build verification

From the repo root, install per package if needed, then:

```bash
cd backend && npm run build
cd ../frontend && npm run build
```

There is no root `lint` / `typecheck` script; `frontend` build runs `tsc && vite build`, and `backend` build runs `tsc`.

## License

See [`LICENSE`](./LICENSE).
