# Thrax

Build
License
Version
Node
TypeScript
React
Express
PostgreSQL
Vite

## Executive Summary

**Navigation:** For a quick “where is X?” guide (attacks, database, frontend pages, defenses), see **[`PROJECT_MAP.md`](./PROJECT_MAP.md)**.

**Thrax** (working name; the repository is also described as a prompt-injection security lab) is a web application for **enterprise-style red-teaming of large language models (LLMs)**. Operators upload benign or adversarial `**.txt` documents**, compose prompts, and run queries through optional **defense pipelines**. Administrators can manage **attack definitions**, run **stress tests** and **analytics** backed by PostgreSQL, and contrast model behavior under injection versus defended runs.

The product exists because teams need a **controlled internal lab** to reproduce prompt-injection and related failures, measure defenses, and retain **audit-friendly** traces—without pointing ad-hoc scripts at production systems.

**Target users** are security engineers, platform owners, and AI governance stakeholders who must **evidence model weakness**, tune mitigations, and demonstrate due diligence. Their pain points include fragmented tooling, lack of reproducible attack corpora, and weak linkage between “a bad answer” and **structured test history**.

This project addresses those needs by combining a **React + Vite** operator UI, an **Express + TypeScript** API, **PostgreSQL** persistence for tests and auth-adjacent data, **Better Auth** session-based login, and an **OpenAI-compatible chat-completions client** aimed at **Cerebras** (`llm.service.ts`). Optional third-party API keys may appear in `env.example` for experiments but are not required for the default path.

**In scope:** authenticated chat and document workflows, admin attack/defense/user management, automated stress testing with Server-Sent Events (SSE) progress, async job tracking, analytics and CSV export, and local-first deployment.

**Out of scope:** managed SaaS hosting, guaranteed production hardening of every edge case, public self-service registration (first account bootstraps the system; further users are created by admins), user-level password resets (all credential management flows through the admin panel), mobile native clients, and official product naming or trademarked release branding beyond the “Thrax” working title.

## Key Features


| Feature                                     | What it does                                                                                                                             | Why it matters                                                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Document upload (`.txt`)**                | Accepts text files up to 5 MB, optional upload-time scanning for encoding and semantic backdoor indicators.                              | Lets teams simulate **data exfiltration via documents** the way real RAG and tool-augmented systems see untrusted files. |
| **InfoBank one-click load**                 | Pre-built test fixtures (clean baselines and poisoned attack documents) live in `InfoBank/`. A single Load button reads them from disk into the in-memory document service via `POST /api/documents/load-infobank`. | Eliminates manual file navigation; operators can populate a test corpus in seconds. Each poisoned fixture includes a trigger query that demonstrates the attack working. |
| **Document library + chat picker**          | Each signed-in account has its **own** document library (scoped by Better Auth `userId` in the in-memory document service). The Documents page manages that account’s library; the chat paperclip opens a picker with per-document checkboxes — ticking attaches to the **current chat session** only. | Separates **account library** (Documents page), **session attachment** (chat picker), and **cross-account isolation** (sign-out clears client state; backend never returns another user’s uploads). |
| **Chat with context**                       | Sends the user prompt plus selected in-memory documents to the configured LLM, with optional active defenses.                            | Core workflow to observe **model behavior with and without** document context and defenses.                              |
| **Defense pipeline**                        | Orchestrates seven defense modules in two stages (input: encoding detector, semantic trigger, canary word, prompt sandwiching; output: LLM judge, DLP filter, session turn tracker). Each module is independently toggleable. | Quantifies whether mitigations **block, alter, or fail** under realistic prompts. All six InfoBank attack types are blocked by at least one enabled defense. |
| **Attack library (DB)**                     | CRUD (admin) against PostgreSQL-backed attacks; built-ins seeded from `shared/attacks.ts`.                                               | Central **versioned attack catalog** instead of one-off prompt files.                                                    |
| **Threat Intel Center (Simulator)**         | Runs three parallel lanes (clean / breach / protected) with the same prompt and document context; UI title “Threat Intel Center”.       | Makes **before/after/defended** behavior visible in one workspace.                                                       |
| **Stress testing (`/api/testing/execute`)** | Long-running loop: many iterations × attacks, streams progress via SSE, persists results and metrics, ties to `async_jobs`.              | Supports **regression-style** benchmarking and cancellation.                                                             |
| **Analytics & traces**                      | Dashboards and filters over `test_runs`, `test_results`, and derived `metrics`; CSV export.                                              | Evidence for **governance** and trend analysis.                                                                          |
| **User & session management**               | Better Auth sessions in `session` table; custom routes for admin user lifecycle; audit log on logout.                                    | Fits **enterprise** expectations for accountability and least privilege.                                                 |
| **Contextual help panel**                   | A `?` button opens a slide-out **Sheet**: header + scrollable steps + optional **Pro Tip**, then an appendix with **Responsible use** (education / authorized testing only). **Admin** sees full lab copy for each page; **`user`** sees sandbox-focused Chat/Documents help only. Flex layout uses **`min-h-0`** on the scroll pane so appendix text cannot overlap numbered steps on short viewports. | Onboarding plus visible lab ethics without cluttering main chrome. |
| **Browser result export**                   | **Simulator:** JSON (full scenario + simulation payload) and CSV summary after a completed run. **Stress Test:** JSON (configuration + accumulated result rows + summary metadata) and CSV (one row per iteration with clipped prompt/response fields). Implemented client-side (`export-download.ts`); filenames use timestamp prefixes. | Evidence capture for governance reports and offline analysis without scraping the DOM. |
| **Structured client error UX**              | Axios responses map via `describe-api-error.ts` into short titles and optional remediation hints (e.g. timeout, rate limit `429`, upstream `502`/`503`, session `401`). **Chat** appends an assistant-style error message; **Simulator** uses an inline alert for non-context failures; **stress test** startup and bootstrap paths surface parsed server messages where available. | Reduces vague “backend not running” confusion when failures are nuanced. |


## Technology Stack


| Category                      | Technology                                                                 | Version (from repo)                 | Purpose / reason                                                                                                |
| ----------------------------- | -------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Runtime                       | Node.js                                                                    | 18+ (documented in `docs/setup.md`) | Server and tooling runtime.                                                                                     |
| Language                      | TypeScript                                                                 | ~5.3 (backend), ~5.8 (frontend)     | Shared types and safer refactors across services.                                                               |
| Frontend framework            | React                                                                      | ^18.3.1                             | SPA operator console.                                                                                           |
| Build / dev server            | Vite                                                                       | ^5.4.19                             | Fast HMR and production bundling.                                                                               |
| UI primitives                 | Radix UI (many `@radix-ui/`* packages)                                     | various                             | Accessible components.                                                                                          |
| Styling                       | Tailwind CSS                                                               | ^3.4.17                             | Utility-first layout and theming.                                                                               |
| Charts                        | Recharts                                                                   | ^2.15.4                             | Analytics dashboards and data visualizations.                                                                   |
| Animations                    | motion (`motion/react`)                                                    | ^12.38.0                            | Page transitions and UI animations.                                                                             |
| Tables                        | `@tanstack/react-table`, `@tanstack/react-virtual`                         | ^8.21.3 / ^3.13.24                  | Data tables with sorting/filtering; virtual scrolling for large lists.                                          |
| Date utilities                | date-fns                                                                   | ^3.6.0                              | Date formatting in analytics and trace views.                                                                   |
| HTTP client                   | Axios                                                                      | ^1.6.2                              | API calls with `withCredentials` for cookies.                                                                   |
| Forms / validation            | react-hook-form, `@hookform/resolvers`                                     | various                             | Typed forms on the client.                                                                                      |
| Schema validation             | Zod                                                                        | ^3.x (frontend) / ^4.x (backend)   | Runtime schema validation; used on both client and server.                                                      |
| Auth (client)                 | better-auth (React client)                                                 | ^1.6.9                              | `createAuthClient` / `useSession` / `signIn.email`.                                                             |
| Backend framework             | Express                                                                    | ^4.18.2                             | REST API, middleware, file upload routes.                                                                       |
| Auth (server)                 | better-auth                                                                | ^1.6.9                              | Session cookies, email/password, Postgres adapter.                                                              |
| Password hashing              | bcryptjs                                                                   | ^3.0.3                              | User passwords and credential account rows (cost factor 12).                                                    |
| Database driver               | pg                                                                         | ^8.18.0                             | Connection pooling to PostgreSQL.                                                                               |
| Database                      | PostgreSQL (Neon-compatible)                                               | Serverless / hosted                 | Persistent users, sessions, tests, attacks, jobs.                                                               |
| File uploads                  | multer                                                                     | ^1.4.5-lts.1                        | In-memory `.txt` upload handling.                                                                               |
| Security middleware           | helmet                                                                     | ^8.1.0                              | Hardened HTTP headers.                                                                                          |
| CORS                          | cors                                                                       | ^2.8.5                              | Allowlisted browser origins with credentials.                                                                   |
| Rate limiting                 | express-rate-limit                                                         | ^8.3.1                              | **`llmLimiter`** on `POST /api/query` and `POST /api/simulator`. **`authLimiter`** once per request on all `/api/auth/*` traffic (custom router + Better Auth catch-all share the same limiter). Defaults: **120**/15 min (production) and **600**/15 min (development) unless `AUTH_RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_DISABLED` override. |
| Cookies                       | cookie-parser                                                              | ^1.4.7                              | Cookie parsing for session integration.                                                                         |
| LLM HTTP                      | axios                                                                      | ^1.6.2                              | Vendor REST calls (Cerebras-style chat completions, etc.).                                                      |
| Caching (optional)            | lru-cache                                                                  | ^11.3.5                             | Available to services where needed.                                                                             |
| UUID                          | uuid                                                                       | ^9.0.1                              | Document IDs in the in-memory document service.                                                                 |
| Dev execution                 | tsx                                                                        | ^4.7.0                              | Run TypeScript during development.                                                                              |
| Secrets (recommended in docs) | Doppler CLI                                                                | external                            | Injects secrets in local workflows (`docs/setup.md`).                                                           |
| Third-party APIs              | Cerebras AI                                                                | configurable                        | Primary chat and judge models.                                                                                  |
| Testing                       | Ad-hoc scripts (`backend/test_better_auth.ts`, `backend/src/test-neon.ts`) | n/a                                 | Manual verification; no Jest/Vitest suite in `package.json`.                                                    |
| DevOps / CI                   | (none in `.github/workflows`)                                              | n/a                                 | Local deployment focus; no repository CI badge.                                                                 |


## System Architecture

The system is a **modular monolith**: a single Express process exposes HTTP APIs, integrates Better Auth, coordinates domain services (documents, attacks, defenses, LLM, jobs, testing), and uses PostgreSQL for durable data. The React SPA is built separately and talks to the API through the Vite dev proxy (`/api` → backend) or a static host plus reverse proxy in production-like setups.

```mermaid
flowchart TB
  subgraph Browser["Browser (operator)"]
    SPA["React SPA (Vite)"]
  end
  subgraph Edge["Local dev: Vite proxy"]
    PROXY["/api → Express :3001"]
  end
  subgraph API["Express API (Node)"]
    MW["Global middleware: helmet, CORS, body parser, cookie parser"]
    AUTH["Better Auth `toNodeHandler` + custom `/api/auth/*` router"]
    REST["REST + SSE routes (`server.ts`, controllers)"]
    SVC["Services: LLM, defense pipeline, documents, attacks, jobs, DB access"]
  end
  subgraph Data["PostgreSQL"]
    PG[("Users, sessions, attacks, defenses, tests, metrics, async_jobs, …")]
  end
  subgraph Vendors["LLM vendors (HTTPS)"]
    CER["Cerebras"]
  end
  SPA --> PROXY
  PROXY --> MW
  MW --> AUTH
  MW --> REST
  REST --> SVC
  AUTH --> PG
  SVC --> PG
  SVC --> CER
```



**Layers and components**

1. **Presentation (React):** Page-level views (chat, documents, attacks, defenses, testing, analytics, user management) and shared UI under `frontend/src/components`. State is mostly local React state plus `AuthContext` backed by Better Auth’s `useSession`.
2. **API edge (Express):** `server.ts` wires security headers, CORS, selective body parsing (skipping JSON parsing for specific Better Auth paths so the raw body reaches `toNodeHandler`), authentication middleware, and route handlers.
3. **Domain services:** Encapsulate LLM calls (`llm.service.ts`), defense orchestration (`services/defense/defense-pipeline.service.ts` plus eleven focused defense modules), document scanning, attack persistence, job lifecycle, and testing orchestration. Defense modules run in two stages: input-stage modules run before the LLM call (encoding detector, semantic trigger, canary word injection, prompt sandwiching) and output-stage modules run after (LLM judge, DLP filter, session turn tracker).
4. **Persistence:** `pg` pool (`config/database.ts`), programmatic migrations and seeds (`db/migrate.ts`), and typed DB helpers (`services/database.service.ts`).
5. **Shared kernel:** `shared/types.ts`, `shared/attacks.ts`, `shared/defenses.ts`, and `shared/constants.ts` align backend and frontend contracts.

## Project Structure (Annotated File Tree)

```text
llmproto-VisualChanges_Sambosa/   # repository root (name may vary per checkout)
├── LICENSE                          # MIT license text
├── README.md                        # High-level index pointing to docs/
├── PROJECT_DOCUMENTATION.md         # Full technical reference
├── PROJECT_MAP.md                   # Quick navigation: attacks, DB, frontend, defenses, …
├── package.json                     # Private monorepo marker (install in backend/ + frontend/)
├── dopplersetup.sh                  # Optional Doppler project bootstrap helper
├── setup.sh                         # Shell helper for local environment setup
├── (assets)                         # e.g. `frontend/public/logo-rami.png` — app logo / favicon
├── database/
│   └── schema.sql                   # Canonical SQL reference (Neon-oriented); mirrors intended DB shape
├── docs/
│   ├── setup.md                     # Local setup, Doppler, Neon
│   ├── architecture.md              # Additional architecture notes
│   ├── testing_framework.md         # Stress test / metrics concepts
│   └── capstone/                    # Evaluation tables, attack/defense design notes
│       ├── README.md
│       ├── evaluation-results.md    # ASR / defense effectiveness tables
│       ├── AttackLogic.md
│       └── DefenseLogic.md
├── shared/
│   ├── types.ts                   # Cross-stack TypeScript contracts
│   ├── attacks.ts                 # Seed attack definitions and helpers
│   ├── defenses.ts                # Seed defense definitions
│   ├── constants.ts               # Shared prompts and constants (e.g. hardened system prompt)
│   └── infobank-manifest.ts       # Metadata for all InfoBank fixtures (displayName, description, triggerQuery, attackType, …)
├── testing/
│   └── framework/                 # Metrics collector and test-runner utilities used by backend
├── backend/
│   ├── package.json               # Backend scripts and dependencies
│   ├── tsconfig.json
│   ├── env.example                # Example environment variable names (see Environment section)
│   ├── test_better_auth.ts        # Manual Better Auth smoke script
│   ├── scripts/
│   │   ├── run-capstone-benchmark.ts   # Batch undefended / full-pipeline stress runs
│   │   └── print-capstone-tables.ts    # Regenerate evaluation tables from PostgreSQL
│   └── src/
│       ├── test-db.ts             # Manual DB connection smoke test
│       ├── test-neon.ts           # Manual Neon connectivity test
│       ├── server.ts              # Express app entry: middleware, routes, startup migrations
│       ├── auth.ts                # Session verification middleware; admin user management routes
│       ├── gen-schema.ts          # Schema generation helper (if used in workflows)
│       ├── config/database.ts     # pg Pool configuration, SSL, lifecycle
│       ├── db/migrate.ts          # Idempotent migrations + seeds (users, attacks, defenses, …)
│       ├── lib/better-auth.ts     # betterAuth() server configuration
│       ├── lib/session-cleanup.ts # Expired session pruning hooks
│       ├── lib/audit.ts           # Audit log writer (e.g. logout events)
│       ├── controllers/
│       │   ├── testing.controller.ts  # Stress test SSE, analytics, test run APIs
│       │   └── jobs.controller.ts     # Async job list/get/patch/cancel
│       ├── types/
│       │   └── better-auth.d.ts       # Type augmentation for Better Auth session
│       └── services/
│           ├── attack.service.ts      # Attack CRUD and seed helpers
│           ├── database.service.ts    # Typed query helpers over pg Pool
│           ├── document.service.ts    # In-memory document store per userId (scan, add, delete)
│           ├── job.service.ts         # Async job lifecycle helpers
│           ├── llm.service.ts         # LLM HTTP client (Cerebras-style chat completions)
│           └── defense/               # Defense pipeline and all defense modules
│               ├── defense-pipeline.service.ts      # Orchestrates active defenses
│               ├── canary-word.service.ts
│               ├── dlp-filter.service.ts
│               ├── document-scanner.service.ts
│               ├── encoding-detector.service.ts
│               ├── llm-judge.service.ts
│               ├── prompt-generator.service.ts
│               ├── prompt-sandwiching.service.ts
│               ├── semantic-trigger-detector.service.ts
│               ├── stress-test-eval.service.ts
│               ├── stress-test-severity.service.ts
│               └── turn-tracker.service.ts
├── frontend/
│   ├── package.json
│   ├── vite.config.ts             # Dev server on port 3000; proxies /api to backend 3001
│   ├── components.json          # shadcn/ui style component metadata
│   └── src/
│       ├── main.tsx               # React root mount
│       ├── App.tsx                # Shell navigation, page switching, data bootstrap
│       ├── App.css                # App-level styles
│       ├── index.css              # Global styles
│       ├── context/AuthContext.tsx    # Maps Better Auth session → app user
│       ├── hooks/use-mobile.tsx       # Responsive breakpoint hook
│       ├── styles/theme.ts            # Centralised theme/colour tokens
│       ├── types/better-auth.d.ts     # Frontend type augmentation for Better Auth
│       ├── lib/auth-client.ts         # Better Auth React client (`baseURL` …/api/auth)
│       ├── lib/auth-toast-suppress.ts # Avoids spurious toasts on intentional sign-out
│       ├── lib/attack-filters.ts      # Client-side attack list filtering helpers
│       ├── lib/notify.ts              # Thin wrapper around the toast/sonner notification system
│       ├── lib/describe-api-error.ts # Human-readable Axios / network failure messages for UI
│       ├── lib/export-download.ts    # Browser download helpers for JSON/CSV exports
│       ├── lib/utils.ts               # General utility helpers (cn, etc.)
│       ├── services/api.ts            # Typed Axios wrappers for REST endpoints
│       └── components/
│           ├── AppShell.tsx           # Navigation chrome, sections, theme toggle
│           ├── ChatInterface.tsx      # Primary LLM chat; **`chatMode`** distinguishes admin lab vs participant sandbox (badge + empty-state copy).
│           ├── DocumentsPage.tsx      # Upload/list/delete documents
│           ├── AttacksPage.tsx        # Admin attack configuration surface
│           ├── DefensesPage.tsx       # Admin defense configuration surface
│           ├── AnalyticsPage.tsx      # Charts and tables over stored metrics
│           ├── TestingPage.tsx        # Stress test launch and SSE progress
│           ├── TestTracesPage.tsx     # Trace inspection
│           ├── Simulator.tsx # Scenario simulation tooling (clean / breach / defended)
│           ├── UserManagementPage.tsx # Admin user CRUD / password flows
│           ├── LoginPage.tsx          # Email/password login UI
│           ├── BottomNav.tsx          # Mobile bottom navigation bar
│           ├── ConfirmModal.tsx        # Reusable confirmation dialog
│           ├── HelpPanel.tsx          # Slide-out contextual help guide (per-page step-by-step tutorial)
│           ├── ui/page-transition.tsx     # Route/page animation wrapper (motion)
│           ├── Toast.tsx              # Toast notification component
│           ├── analytics/             # Analytics sub-components (kpi-card, columns)
│           ├── users/                 # User management sub-components
│           └── ui/                    # Radix-based primitives (buttons, dialogs, tables, etc.)
└── InfoBank/
    ├── clean/                     # Five clean baseline .txt documents (Finance, HR, IT, Operations, Legal)
    └── poisoned/                  # Six poisoned attack fixture .txt documents
                                   # Each pairs with a triggerQuery in infobank-manifest.ts that demonstrates the attack working
```

## Authentication & Authorization

### Mechanism

The application uses **Better Auth** with **email and password**, backed by PostgreSQL. Sessions are tracked in the `**session`** table; the browser stores session cookies and sends them on subsequent requests (`axios.defaults.withCredentials = true`). API routes that require a logged-in user call `**authenticateToken**`, which invokes `auth.api.getSession({ headers: fromNodeHeaders(req.headers) })` and maps the session to `req.user` (`userId`, `email`, `role`).

> **Note:** `backend/package.json` still lists `jsonwebtoken` (unused by the Better Auth session gate). **`backend/env.example`** keeps **`JWT_SECRET` / `JWT_EXPIRES_IN`** as **commented** reference only — sessions are cookie-based via Better Auth, not JWT-verified API middleware.

### Registration and login flow (step by step)

1. **Bootstrap:** When the database has **zero** users, `POST /api/auth/register` is **public** and creates the first account (intended as an admin). An advisory transaction lock prevents concurrent double-bootstrap.
2. **Subsequent registrations:** `POST /api/auth/register` requires an **existing admin or super_admin** Better Auth session; admins create additional users with assigned roles.
3. **Credential storage:** New users receive a **bcrypt-hashed** row in `users.password_hash` and a matching `**account`** row with `providerId = 'credential'` for Better Auth.
4. **Login:** The React app calls `authClient.signIn.email({ email, password })`, which hits Better Auth under `**/api/auth/sign-in/...`** (proxied to the backend). On success, Better Auth sets a **session cookie**.
5. **Authenticated API calls:** The SPA issues Axios requests to `/api/...` with cookies. `authenticateToken` resolves the session and attaches `req.user`.
6. **Logout:** `authClient.signOut()` posts to Better Auth’s sign-out route; the server wraps sign-out to append an **audit log** entry after the response completes. The SPA clears **documents** and admin-only in-memory state immediately so the next account does not inherit the previous library in the UI.

### Token / session lifecycle


| Stage          | Behavior                                                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Creation**   | Better Auth creates a row in `session` with `expiresAt`, `token`, and `userId`. A database hook records successful login in `login_events` and prunes excess sessions per user (`SESSION_MAX_PER_USER`, default 5). |
| **Validation** | Each protected API call uses `getSession` from cookies forwarded by the browser.                                                                                                                                    |
| **Expiry**     | Governed by Better Auth session settings and the `expiresAt` column; `deleteExpiredSessions()` runs during server startup when the DB is configured.                                                                |
| **Refresh**    | Handled internally by Better Auth’s session mechanism (cookie-based); clients do not manually attach bearer tokens in the shipped SPA.                                                                              |


### Authorization model


| Role              | Capabilities (high level)                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `**user`**        | **UI:** Chat and Documents only (`ADMIN_ONLY_PAGES` in `App.tsx`). Participants see sandbox labeling (e.g. “Injection sandbox”) and empty-state copy explaining manual prompt-injection exercises without defense toggles. **`GET /api/defenses`** is allowed (metadata), but **`PATCH /api/defenses/:id`** is admin-only; the shipped Chat client sends **`activeDefenses: []`** for this role. **`POST /api/query`** and **`POST /api/simulator`** remain callable with a session for advanced callers, but Simulator and stress tooling are **not** exposed in the sidebar. |
| `**admin`**       | Full lab: attack CRUD, defense toggles, simulator, stress tests, analytics/jobs APIs, user management, plus everything a `user` can do in Chat/Documents. |
| `**super_admin**` | Same gate as admin for `requireAdmin`; additional `**requireSuperAdmin**` middleware exists for future stricter operations.                |


### Security measures

- **Password hashing:** bcrypt with cost factor **12** (Better Auth hooks and manual user creation in `auth.ts`).
- **HTTPS:** Expected in production deployments; local dev commonly uses HTTP on localhost.
- **CORS:** Allowlist built from `FRONTEND_URL` / `FRONTEND_URLS` plus fixed localhost origins; `credentials: true` for cookies.
- **Headers:** `helmet()` applied globally; `X-Powered-By` disabled.
- **Rate limiting:** `llmLimiter` on `/api/query` and `/api/simulator`. `authLimiter` applies **once** per `/api/auth/*` request (`app.use('/api/auth', authLimiter)` before both the custom `authRouter` and the Better Auth `app.all('/api/auth/*', …)` handler—avoid stacking the limiter twice). Tune via `AUTH_RATE_LIMIT_MAX` or disable locally with `AUTH_RATE_LIMIT_DISABLED=1` (see `backend/env.example`).
- **Upload validation:** Multer restricts uploads to `**.txt`** and **5 MB**.

```mermaid
sequenceDiagram
  participant U as Operator browser
  participant V as Vite dev server
  participant B as Express + Better Auth
  participant D as PostgreSQL

  U->>V: POST /api/auth/sign-in/email (via proxy)
  V->>B: Forward sign-in request with body
  B->>D: Validate credentials / load user
  D-->>B: User + account rows
  B-->>U: Set-Cookie session
  U->>V: GET /api/documents (cookie)
  V->>B: Forward with Cookie header
  B->>B: authenticateToken → getSession
  B-->>U: 200 JSON documents payload
  U->>V: POST /api/auth/sign-out
  V->>B: Better Auth sign-out
  B->>D: Invalidate/remove session (framework behavior)
  B-->>U: Clear session cookie (framework behavior)
  Note over B,D: On sign-out success, audit row may be written asynchronously
```



## Application Workflow & Logic

### End-to-end user journey

1. Operator opens the SPA (development: `http://localhost:3000` per `vite.config.ts`).
2. **Login** via `LoginPage` → Better Auth email sign-in.
3. **Admin** lands on analytics by default; **standard user** lands on chat.
4. User populates the document library via one of three paths:
   - **Manual upload:** drag-and-drop or file picker on the Documents page or the chat paperclip.
   - **InfoBank one-click load:** expand the InfoBank panel on the Documents page, click **Load** next to any fixture. The backend reads the file from `InfoBank/{folder}/{filename}`, adds it to **that user’s** in-memory library, and the frontend refreshes the library and auto-attaches the document to the current chat.
   - **Chat paperclip picker:** click the paperclip in the chat input bar to open the library picker and tick any already-loaded document into the current conversation.
5. For poisoned fixtures, copy the **trigger query** shown beneath the fixture in the InfoBank panel, paste it into the chat, and send — the AI will incorporate the planted instruction if no defenses are blocking it.
6. **Defense toggles** (which layers feed `POST /api/query`) are **admin / super_admin** only. Standard **`user`** accounts use the **sandbox chat** (`activeDefenses: []` from the client); admins enable layers on **Defenses**, then re-run queries to see pipeline verdicts.
7. Operator selects attached documents and sends a **chat query** → `POST /api/query` merges document text with the prompt, optionally runs `**runDefensePipeline**` when defenses are active, and returns model output plus `**defenseState**` metadata.
8. Admins may run **stress tests** from the Testing UI → `POST /api/testing/execute` streams SSE events while persisting structured results.

### Business rules and validations

- **Prompt required** for `/api/query` and `/api/simulator`; missing prompt → **400**.
- **Context limit:** `llmService.checkContextLimit` rejects oversized prompts with **400** and token estimates.
- **Attack creation:** Requires `name`, `description`, `injectionText`, `category`, `tier`; slug `id` derived from `name`; duplicate slug → **409**.
- **Built-in attacks** cannot be deleted by the delete endpoint (service returns not found).
- **Defense toggle:** `PATCH /api/defenses/:id` flips enabled state in an in-memory map (seed list in `shared/defenses.ts`).
- **Stress test:** Requires at least one `attackId`; optional `iterations` (default 50, UI range 1–500 with draft input committed on blur/submit), `defenseIds`, uploaded `documentIds` referencing **that user’s** in-memory docs, optional `scoreThreshold` clamped between 0.05 and 0.95.

### Data flow (chat query)

```mermaid
flowchart LR
  A[User prompt + doc IDs + defense IDs] --> B[React `api.query`]
  B --> C[Express `authenticateToken`]
  C --> D[`documentService.getDocumentsByIds(userId, …)`]
  D --> E[Build documentContext string]
  E --> F{Defenses active?}
  F -->|Yes| G[`runDefensePipeline` + optional judge LLM]
  F -->|No| H[`llmService.queryWithContext`]
  G --> I[JSON `QueryResponse`]
  H --> I
```



### Error handling

- Route handlers `**try/catch**`, log with `console.error`, and return **JSON** `{ error, details? }` with **4xx/5xx** as appropriate.
- Multer / parser errors propagate through Express error handling path where configured.
- SSE stress tests: on failure after headers sent, emit an `**error`** event on the stream; jobs finalize to `**failed**` in `async_jobs` when possible.
- **SPA:** Axios errors are surfaced through `describe-api-error.ts` (titles + remediation hints); stress-test startup uses parsed JSON `error` when `fetch` returns non-`ok` **before** the SSE body begins streaming.

### Primary workflow diagram (stress test)

```mermaid
sequenceDiagram
  participant UI as Testing UI (admin)
  participant API as POST /api/testing/execute
  participant Job as async_jobs table
  participant LLM as Cerebras / LLM service
  participant DB as test_runs / test_results / metrics

  UI->>API: JSON body (attacks, iterations, defenses, …)
  API->>Job: createJob (best effort)
  API-->>UI: 200 SSE stream (text/event-stream)
  loop Each iteration × attack
    API->>LLM: queryWithContext / pipeline
    LLM-->>API: model output
    API->>DB: persist intermediate rows (as implemented)
    API-->>UI: SSE `progress` / `result` events
  end
  API->>DB: finalize test_run, metrics
  API-->>UI: SSE `done` event
```



## API Reference

**Conventions**

- Unless noted, routes under `/api` **after** `app.use('/api', authenticateToken)` require a **valid Better Auth session cookie** (same-origin or proxied).
- Admin-only routes additionally require `**requireAdmin`** (`admin` or `super_admin` role).
- Better Auth built-in routes live under `**/api/auth/***` and use the framework’s request/response shapes.

### Public routes


| Method | Endpoint              | Auth | Request body | Success response                               | Description                                                                       |
| ------ | --------------------- | ---- | ------------ | ---------------------------------------------- | --------------------------------------------------------------------------------- |
| `GET`  | `/api/run-migrations` | No   | —            | `200` text: `Migrations executed successfully` | **Development only** (`NODE_ENV !== 'production'`). Runs programmatic migrations. |
| `GET`  | `/api/health`         | No   | —            | `200` JSON                                     | Liveness: `{ status, llmConfigured, timestamp, model }`. `model` reflects `LLM_MODEL` env when set or a fallback string for display (see backend `GET /api/health` handler). |


**Example `GET /api/health`**

```json
{
  "status": "ok",
  "llmConfigured": true,
  "timestamp": "2026-05-12T12:00:00.000Z",
  "model": "qwen-3-235b-a22b-instruct-2507"
}
```

### Better Auth routes (subset)


| Method | Endpoint                  | Auth                    | Request body                        | Success response      | Description                                                       |
| ------ | ------------------------- | ----------------------- | ----------------------------------- | --------------------- | ----------------------------------------------------------------- |
| `POST` | `/api/auth/sign-in/email` | No                      | Better Auth email sign-in JSON      | `200` + `Set-Cookie`  | Email/password login (exact field names per Better Auth version). |
| `POST` | `/api/auth/sign-out`      | Session                 | (raw body; not Express-json parsed) | `200`                 | Ends session; server may write `audit_log` asynchronously.        |
| `GET`  | `/api/auth/get-session`   | Session cookie optional | —                                   | Session JSON or empty | Used by client session hooks.                                     |


**Example sign-in request (illustrative)**

```json
{
  "email": "admin@lab.com",
  "password": "admin1234"
}
```

### Custom auth routes (`auth.ts`, mounted at `/api/auth`)


| Method   | Endpoint                   | Auth                                                  | Request body                 | Success response                 | Description                                                                             |
| -------- | -------------------------- | ----------------------------------------------------- | ---------------------------- | -------------------------------- | --------------------------------------------------------------------------------------- |
| `POST`   | `/api/auth/register`       | Public **only** if no users exist; else admin session | `{ email, password, role? }` | `201` user JSON                  | Creates user + credential `account` row; password strength rules enforced in `auth.ts`. |
| `GET`    | `/api/auth/users`          | Admin session                                         | —                            | `200` array of users             | Lists non-deleted users.                                                                |
| `DELETE` | `/api/auth/users/:id`      | Admin session                                         | —                            | `200` / `204`-style success JSON | Soft-delete user (`deleted_at`).                                                        |
| `POST`   | `/api/auth/reset-password` | Admin session                                         | `{ userId, newPassword }`    | JSON success                     | Admin resets another user’s password.                                                   |


### Authenticated application routes (`server.ts`)


| Method   | Endpoint                          | Auth      | Request body                                              | Success response                   | Description                                                                                                                                                     |
| -------- | --------------------------------- | --------- | --------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/documents`                  | User      | —                                                         | `{ documents, stats }`             | Lists **that user’s** in-memory documents (scoped by session `userId`).                                                                                         |
| `POST`   | `/api/documents/upload`           | User      | `multipart/form-data` (`file`, `applySanitization`)       | `{ document, scanResult? }`        | Upload `.txt` into **that user’s** library. Sets **`document.untrustedUpload: true`** (unknown provenance — treated as potentially malicious in UI; excluded from `/api/simulator` clean baseline). Returns optional heuristic **`scanResult`** (encoding/semantic indicators).                                                                                                                      |
| `POST`   | `/api/documents/load-infobank`    | User      | `{ filename: string, folder: "clean" \| "poisoned" }`    | `{ success: true, document }`      | Reads a pre-built fixture from `InfoBank/{folder}/{filename}` on disk into **that user’s** in-memory library. `folder: "poisoned"` sets `document.isPoisoned = true` so **`/api/simulator` excludes them from the clean baseline** while chat and stress tests still receive full context when those IDs are selected. Folder must be exactly `clean` or `poisoned`; filename is `path.basename`-sanitized; path is validated to stay inside `InfoBank/`. |
| `DELETE` | `/api/documents/:id`              | User      | —                                                         | `{ success: true }`                | Deletes one doc from **that user’s** library.                                                                                                                   |
| `DELETE` | `/api/documents`                  | User      | —                                                         | `{ success: true }`                | Clears **that user’s** in-memory docs only.                                                                                                                    |
| `GET`    | `/api/attacks`           | **Admin**                  | —                                                         | `Attack[]`                         | Lists attacks from DB.                                 |
| `POST`   | `/api/attacks`           | **Admin**                  | `{ name, description, injectionText, category, tier, … }` | `201` attack                       | Creates custom attack.                                 |
| `DELETE` | `/api/attacks/:attackId` | **Admin**                  | —                                                         | `{ success: true }`                | Deletes non-built-in attack.                           |
| `GET`    | `/api/defenses`          | User                       | —                                                         | `Defense[]` with toggled `enabled` | Returns merged seed + runtime enabled flags.           |
| `PATCH`  | `/api/defenses/:id`      | **Admin**                  | —                                                         | Updated defense JSON               | Toggles defense enabled.                               |
| `POST`   | `/api/query`             | User (+ `llmLimiter`)      | `QueryRequest`                                            | `QueryResponse`                    | Main LLM query with optional defenses.                 |
| `POST`   | `/api/simulator`         | User (+ `llmLimiter`)      | `SimulatorRequest`                                       | `SimulatorResponse`               | Parallel lanes (clean / breach / defended). Baseline **clean** column uses only documents with `isPoisoned === false` **and** `untrustedUpload !== true` from `documentIds`; synthetic poisoned docs from `attackIds` are merged only into **attacked** / **defended**. |


**Example `POST /api/query`**

```json
{
  "prompt": "Summarize the vendor risks.",
  "documentIds": ["uuid-doc-1"],
  "activeDefenses": ["input-sanitizer"]
}
```

**Example `200` response (abbreviated)**

```json
{
  "response": "…model text…",
  "defenseState": {
    "activeDefenses": ["input-sanitizer"],
    "flagged": false
  },
  "truncated": false,
  "tokenCount": 123
}
```

**Status codes (typical)**


| Code  | When                                                      |
| ----- | --------------------------------------------------------- |
| `200` | Success.                                                  |
| `400` | Missing/invalid body, context too large, wrong file type. |
| `401` | No or invalid session.                                    |
| `403` | Authenticated but not admin for admin route.              |
| `404` | Unknown document or attack.                               |
| `409` | Duplicate attack slug.                                    |
| `429` | Rate limit (`llmLimiter` on LLM routes; `authLimiter` on `/api/auth/*`). |
| `500` | Unexpected failure; often logged server-side.             |


### Admin testing, analytics, and jobs (`testing.controller.ts`, `jobs.controller.ts`)

All mounted under `/api` **with** `requireAdmin` in `server.ts`.


| Method  | Endpoint                        | Request body                       | Response                     | Description                                                                 |
| ------- | ------------------------------- | ---------------------------------- | ---------------------------- | --------------------------------------------------------------------------- |
| `POST`  | `/api/testing/execute`          | Stress test JSON                   | `200` **SSE** stream         | Long-running adversarial batch; events: `start`, progress, `done`, `error`. |
| `POST`  | `/api/testing/run`              | `{ name?, description?, config? }` | Test run row                 | Creates `test_runs` row.                                                    |
| `PUT`   | `/api/testing/run/:runId`       | Partial update fields              | `{ success: true }`          | Updates a test run.                                                         |
| `POST`  | `/api/testing/results`          | Result payload                     | `{ success: true }`          | Inserts detailed result.                                                    |
| `GET`   | `/api/testing/results/:runId`   | —                                  | Result array                 | Fetches results for a run.                                                  |
| `GET`   | `/api/testing/runs`             | Query: `limit?`                    | Array of runs                | Lists recent runs.                                                          |
| `GET`   | `/api/testing/traces`           | Query filters                      | `{ data, total }`            | Paginated traces.                                                           |
| `GET`   | `/api/testing/random-prompt`    | —                                  | `{ prompt }`                 | Random test prompt helper.                                                  |
| `GET`   | `/api/analytics/all`            | —                                  | Analytics bundle             | Aggregate analytics.                                                        |
| `GET`   | `/api/analytics/metrics`        | —                                  | Stats JSON                   | Overall metrics.                                                            |
| `GET`   | `/api/analytics/by-defense`     | —                                  | Metrics array                | Grouped by defense.                                                         |
| `GET`   | `/api/analytics/by-attack`      | —                                  | Metrics array                | Grouped by attack.                                                          |
| `GET`   | `/api/analytics/export-csv`     | —                                  | `text/csv` file              | Downloads CSV export.                                                       |
| `GET`   | `/api/analytics/metrics/:runId` | —                                  | Metrics for run              | Per-run metrics.                                                            |
| `GET`   | `/api/jobs`                     | `?limit=`                          | Job array                    | Lists async jobs.                                                           |
| `GET`   | `/api/jobs/:jobId`              | —                                  | Job row                      | Job detail including `progress`.                                            |
| `PATCH` | `/api/jobs/:jobId`              | `{ label?, metadata? }`            | Updated job                  | Metadata only update.                                                       |
| `POST`  | `/api/jobs/:jobId/cancel`       | —                                  | `{ accepted, message, job }` | Cooperative cancel for running jobs.                                        |


## Database Design

### Choice of database

**PostgreSQL** (commonly **Neon** serverless in documentation) is used for **durable, relational** data: users, Better Auth tables, audit and login telemetry, attack/defense catalogs, asynchronous jobs, and the full testing/analytics schema. It supports **constraints**, **JSONB** for flexible configurations, and **indexes** for reporting queries.

### Entity overview


| Table                                  | Purpose                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `users`                                | Application identities, roles (`super_admin` / `admin` / `user`), lockout counters, soft delete. |
| `session`                              | Better Auth sessions (`expiresAt`, `token`, `userId`, …).                                        |
| `account`                              | Better Auth linked accounts; `providerId = 'credential'` stores password hash for email login.   |
| `verification`                         | Better Auth verification tokens.                                                                 |
| `refresh_tokens` / `auth_sessions`     | Legacy or auxiliary session tracking (schema supports rotation/revocation patterns).             |
| `login_events`                         | Successful and failed login attempts.                                                            |
| `audit_log`                            | Security-sensitive actions (e.g. logout).                                                        |
| `documents`                            | SQL-backed document model (schema present; primary runtime path today uses in-memory service).   |
| `attacks`                              | Attack library rows (seeded + custom).                                                           |
| `defenses`                             | Defense catalog metadata (seeded).                                                               |
| `test_runs`, `test_results`, `metrics` | Testing sessions, granular outcomes, aggregates.                                                 |
| `behavioral_patterns`                  | Behavioral anomaly feature support.                                                              |
| `async_jobs`                           | Long-running job tracking for stress tests and similar work.                                     |


### Relationships (summary)

- `**users` 1 — * `session`**, **1 — * `account`**, **1 — * `login_events`**, **1 — * `audit_log`** (nullable FKs where soft-deleted actors).
- `**test_runs` 1 — * `test_results*`*, **1 — * `metrics`**, optional link from `**async_jobs.linked_test_run_id**`.

### ER diagram (core)

```mermaid
erDiagram
  users ||--o{ session : has
  users ||--o{ account : has
  users ||--o{ login_events : generates
  users ||--o{ audit_log : acts
  users ||--o| documents : uploads
  users ||--o{ attacks : creates
  test_runs ||--o{ test_results : contains
  test_runs ||--o{ metrics : aggregates
  test_runs ||--o{ async_jobs : may_link
```



### Indexing and performance

- B-tree indexes on **email**, **role**, **foreign keys**, **timestamps**, and filter columns (`success`, `attack_type`, `llm_provider`) support analytics pages.
- Partial index on active `auth_sessions` speeds revocation/expiry queries.
- JSONB columns (`configuration`, `defense_state`, `metadata`) avoid wide sparse schemas but should be queried with care to limit scanned rows (add indexes or materialized views if reporting grows).

## Frontend Overview

### Framework and state

- **React 18** function components with hooks.
- **No Redux:** local `useState` in `App.tsx` for documents, attacks, defenses, messages, and navigation; `**AuthContext`** wraps Better Auth session state.

### Major components


| Component / area                        | Responsibility                                           |
| --------------------------------------- | -------------------------------------------------------- |
| `LoginPage`                          | Email/password login UI.                                                  |
| `AppShell`                           | Navigation chrome, sections, theme toggle.                                |
| `ChatInterface`                      | Primary LLM chat experience. The paperclip button opens a **document library picker** popover showing **the signed-in user’s** library with checkboxes; ticking a document attaches it to the current chat session only. Includes "Upload new file" as a secondary option. |
| `DocumentsPage`                      | Per-account document library. Supports file upload, search, preview, delete, and the **InfoBank panel** — a collapsible section showing all 11 pre-built fixtures with one-click Load buttons. Poisoned fixtures each display a trigger query with a Copy button. Loading a fixture auto-attaches it to the current chat. |
| `AttacksPage`, `DefensesPage`        | Admin configuration surfaces.                                             |
| `TestingPage`, `TestTracesPage`      | Stress tests and trace inspection. **`TestingPage`** streams SSE batches, exposes **JSON/CSV export** for accumulated result rows, and uses a **draft-style iterations input** (1–500) committed on blur or submit so multi-digit values can be typed without snapping to `1`. |
| `AnalyticsPage`                      | Charts and tables over stored metrics (uses Recharts).                    |
| `Simulator`                | Scenario simulation (clean vs breach vs defended). After a run, **JSON/CSV export** captures scenario metadata and outputs. |
| `UserManagementPage`                 | Admin user CRUD / password flows.                                         |
| `BottomNav`                          | Mobile-friendly bottom navigation bar.                                    |
| `ConfirmModal`                       | Reusable confirmation dialog (destructive action guard).                  |
| `HelpPanel`                          | Slide-out Sheet (`?`): role-aware numbered steps + **Pro Tip**. Scroll body ends with **Responsible use** and a navigation note. A **`min-h-0`** flex child ensures steps scroll cleanly above appendix text on short viewports. |
| `PageTransition`                     | Implemented as `components/ui/page-transition.tsx` (motion-based page transitions).                   |
| `components/ui/*`                    | Radix-based primitives (buttons, dialogs, tables, charts, toasts, etc.). |


### Routing and access control

Routing is **state-driven** (`currentPage` in `App.tsx`), not React Router file routes.


| Logical page                                                                                                 | Typical access                                                                          |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `chat`, `documents`                                                                                          | All authenticated users.                                                                |
| `analytics`, `simulator`, `attacks`, `defenses`, `testing`, `test-traces`, `users` | **Admin / super_admin** only (`ADMIN_ONLY_PAGES`); non-admins are coerced back to chat. |


### Backend communication

- **REST JSON** via Axios to `/api/...` with **credentials** for cookies.
- **SSE** consumer for `/api/testing/execute` (EventSource-style parsing on the client side as implemented in `TestingPage`).
- Vite `**server.proxy`** forwards `/api` to `http://127.0.0.1:3001` during development.

### UI / UX

- **Tailwind CSS** with **dark / light / system** appearance. **Signed-in** preference is stored per account under **`localStorage`** key `thrax_theme_<userId>` (with one-time migration from legacy global `theme` when present). The **login** screen forces **dark** until a session loads so themes do not leak across accounts on a shared browser profile.
- **Chat history** is also **per user id**: `thrax_chat_sessions_<userId>`. **Sign-out** prepends a fresh empty chat to persisted sessions so the next login opens a new thread while older threads remain in the sidebar (24 h TTL pruning unchanged).
- **Document library state** is **per user id** on the server (`document.service.ts` keyed by `userId`) and in the SPA: **`App.tsx` clears documents (and admin-only attack/defense state) on sign-out and immediately on account switch** before refetching, so another account’s uploads never linger in the UI.
- **shadcn/ui-style** composition (`components.json`, Radix primitives) for consistent spacing and accessible controls.
- **Toast** system (`sonner` via `notify`) for user feedback, with guards to suppress noise during intentional logout.
- **Contextual help** (`HelpPanel.tsx`): see component table — **role-aware** copy plus **Responsible use** appendix inside the sheet scroll region.

## Backend Overview

### Framework and lifecycle

1. Load environment variables (`dotenv`).
2. Construct Express app, register **helmet**, **cookie-parser**, **CORS**, conditional **JSON/urlencoded** parsers (skipping Better Auth internal paths).
3. Apply **`authLimiter`** once via **`app.use('/api/auth', authLimiter)`**, then **`app.use('/api/auth', authRouter)`** (custom routes), then **`app.all('/api/auth/*', …, toNodeHandler(auth))`** for Better Auth — **without** a second `authLimiter` on the catch-all (stacking doubled counts and caused frequent `429`s).
4. Expose `**/api/health**` publicly.
5. Apply `**app.use('/api', authenticateToken)**` — everything after requires a session.
6. Register domain routes and `**requireAdmin**` sub-routers for testing and jobs.
7. On listen, optionally **run migrations**, **seed** accounts/attacks/defenses, and **cleanup** sessions / deleted accounts when `DATABASE_URL` is valid.

### Structural pattern

- **Thin route handlers** in `server.ts` and **controllers** for larger areas (testing, jobs).
- **Services** encapsulate business logic and persistence (`*.service.ts`).
- **Shared types** imported from `/shared` keep parity with the frontend.

### Background work

- **No separate worker process** in-repo: stress tests run **inline** in the HTTP handler while streaming SSE; cancellation is **cooperative** via `async_jobs.cancel_requested` polling.
- **Startup maintenance:** migrations, seeds, session cleanup, deleted-account cleanup.

### Caching

- `lru-cache` is a dependency; specific defense or LLM components may use in-memory caches where implemented. Hot path document storage is a **process-local `Map` keyed by `userId`** (each account’s uploads/InfoBank loads are isolated; data is lost on server restart).

### Logging and monitoring

- `**console.log` / `console.error`** style logging throughout services.
- **No OpenTelemetry / APM** integration in the scanned tree; operators rely on logs and database tables for forensic detail.

## Environment Configuration

Create a `**backend/.env`** (or inject equivalent variables via **Doppler** per `docs/setup.md`). Do **not** commit real secrets.


| Variable name                   | Description                                                             | Example value                                    | Required?                                                      |
| ------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| `DATABASE_URL`                  | PostgreSQL connection URI                                               | `postgresql://user:pass@host/db?sslmode=require` | **Yes** for auth DB features, testing persistence, and seeds   |
| `PORT`                          | HTTP listen port                                                        | `3001`                                           | No (defaults to `3001`)                                        |
| `NODE_ENV`                      | Runtime mode                                                            | `development` / `production`                     | Recommended                                                    |
| `FRONTEND_URL`                  | Primary browser origin for Better Auth trusted origins                  | `http://localhost:3000`                          | Recommended                                                    |
| `FRONTEND_URLS`                 | Comma-separated extra allowed CORS origins                              | `http://localhost:3000,http://127.0.0.1:3000`    | No                                                             |
| `BETTER_AUTH_URL`               | Public base URL of the API for Better Auth                              | `http://localhost:3001`                          | Recommended (dev uses Host/Origin rewrite when not production) |
| `SESSION_MAX_PER_USER`          | Max concurrent sessions per user after login                            | `5`                                              | No                                                             |
| `COOKIE_DOMAIN`                 | Enables cross-subdomain cookies with Better Auth when set in production | `app.example.com`                                | Production-only consideration                                  |
| `DB_SSL_INSECURE`               | If `true`, relaxes SSL behavior for special dev cases                   | `false`                                          | No                                                             |
| `CEREBRAS_API_KEY`              | API key for default LLM stack                                           | `sk-…`                                           | **Yes** for real completions                                   |
| `CEREBRAS_BASE_URL`             | Chat completions base URL                                               | `https://api.cerebras.ai/v1`                     | No                                                             |
| `LLM_MODEL`                     | Model id for Cerebras-style `/chat/completions` calls                    | `qwen-3-235b-a22b-instruct-2507`                 | No (`server.ts` and `/api/health` default to this id when unset) |
| `MAX_TOKENS`                    | Default max tokens for primary LLM service                              | `8000`                                           | No                                                             |
| `LLM_RATE_LIMIT_MAX`            | Max requests per 15 minutes window for `/api/query` and `/api/simulator` | `120`                                            | No                                                             |
| `AUTH_RATE_LIMIT_MAX`           | Max `/api/auth/*` requests per 15 minutes (single shared limiter)       | **`120`** prod default / **`600`** dev default   | No (overrides built-in prod/dev defaults)                     |
| `AUTH_RATE_LIMIT_DISABLED`      | Set to `1` to skip auth rate limiting (local debugging only)            | `1`                                              | No                                                             |
| `JUDGE_COST_PER_1K_TOKENS_USD`  | Optional economics display for judge usage                              | `0`                                              | No                                                             |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | Commented examples in `env.example` only                               | —                                                | **Not used** by Better Auth session validation                  |


**Files:** copy `backend/env.example` to `backend/.env` and replace placeholder values. For Doppler workflows, see `docs/setup.md` and `dopplersetup.sh`.

## Installation & Setup

### Prerequisites

- **Node.js 18+** and **npm**.
- A **PostgreSQL** instance (Neon or other) reachable from your machine.
- Optional: **Doppler CLI** for secret injection.

### Install dependencies

```bash
cd backend
npm install

cd ../frontend
npm install
```

### Configure environment

```bash
cd backend
cp env.example .env
# Edit .env — set DATABASE_URL, CEREBRAS_API_KEY, FRONTEND_URL, BETTER_AUTH_URL, etc.
```

### Database schema and seeds

Migrations and seeds run **automatically on backend startup** when `DATABASE_URL` is set and not equal to the placeholder `your_neon_database_url_here`.

To run migrations **manually**:

```bash
cd backend
npx tsx src/db/migrate.ts
```

**Seeded accounts** (from `migrate.ts`, only created if not already present):


| Email                | Password         | Role          |
| -------------------- | ---------------- | ------------- |
| `superadmin@lab.com` | `superadmin1234` | `super_admin` |
| `admin@lab.com`      | `admin1234`      | `admin`       |
| `user@lab.com`       | `user1234`       | `user`        |


> Change passwords immediately in any shared or non-throwaway environment.

### Optional Doppler workflow

```bash
doppler login
./dopplersetup.sh
cd backend
doppler run -- npm run dev
```

## Running the Project

### Development

**Terminal 1 — backend**

```bash
cd backend
npm run dev
```

Expected console output includes a line similar to:

```text
🚀 Server running on http://localhost:3001
📡 LLM API configured: true
🤖 Model: qwen-3-235b-a22b-instruct-2507
```

**Terminal 2 — frontend**

```bash
cd frontend
npm run dev
```

Open `**http://localhost:3000**` (Vite `strictPort: true` on port 3000). The UI proxies `/api` to the backend.

### Production-like build

```bash
cd frontend
npm run build
npm run preview   # optional local static preview

cd ../backend
npm run build
npm run start     # runs compiled JS from dist per package.json "start" script
```

### Docker

**No `Dockerfile` or `docker-compose.yml` is present** in this repository; deployment is **local** or bring-your-own container packaging.

## Testing


| Layer                  | Tooling                                                                   | Notes                                                   |
| ---------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Unit / integration** | None configured in `package.json` scripts                                 | No `jest`, `vitest`, or `mocha` test runner wired.      |
| **Empirical evaluation** | `backend/scripts/run-capstone-benchmark.ts`, `print-capstone-tables.ts` | Persists stress-test iterations to PostgreSQL; regenerates thesis ASR tables. |
| **Manual scripts**     | `npx tsx backend/test_better_auth.ts`, `npx tsx backend/src/test-neon.ts` | Developer smoke tests; may require valid `.env` and DB. |
| **End-to-end**         | Manual browser flows + admin stress test UI                               | Login, upload, query, Simulator, stress test SSE.       |


**Commands (examples)**

```bash
cd backend
npx tsx test_better_auth.ts
npx tsx src/test-neon.ts

# Capstone benchmark (requires DATABASE_URL + CEREBRAS_API_KEY)
doppler run -- npx tsx scripts/run-capstone-benchmark.ts --mode undefended --iterations 50
doppler run -- npx tsx scripts/run-capstone-benchmark.ts --mode full-pipeline --iterations 50
doppler run -- npx tsx scripts/print-capstone-tables.ts
```

**Evaluation output:** see `docs/capstone/evaluation-results.md` for table definitions and interpretation notes.

**Coverage thresholds:** not defined in this repository.

## Deployment

### Targets

- **Local developer machines** are the primary documented target (`docs/setup.md`, Vite proxy).
- Production-style deployment would require you to supply a **reverse proxy**, **TLS certificates**, **managed PostgreSQL**, and **secret storage**—patterns are not codified as infrastructure-as-code in this repo.

### CI/CD

There is **no GitHub Actions workflow** checked in; treat builds and releases as a **manual** process unless you add CI later.

### Steps (conceptual production rollout)

1. Provision **PostgreSQL** and set `DATABASE_URL`.
2. Build the frontend (`npm run build`) and host `frontend/dist` on a static file server or CDN.
3. Run the backend behind **HTTPS**, set `NODE_ENV=production`, configure `**FRONTEND_URL`**, `**BETTER_AUTH_URL**`, and optional `**COOKIE_DOMAIN**` for cross-subdomain cookies.
4. Remove or protect `**/api/run-migrations**` exposure; rely on controlled migration jobs instead.
5. Rotate all default seeded passwords.

### Environment-specific behavior

- **Development:** Express rewrites `Origin` / `Host` for Better Auth to match `BETTER_AUTH_URL` so Vite proxying works.
- **Production:** That rewrite is **disabled**; you must align real public URLs with Better Auth configuration.

## Security Considerations

- **Input validation:** JSON bodies are validated ad hoc per route (e.g. required fields, array types); Zod is a backend dependency but not universally applied—extend validation when hardening.
- **File uploads:** Extension and size limits reduce zip-bomb style issues; content is still **fully read into memory**—operate within trusted networks.
- **SQL injection:** Server code predominantly uses **parameterized queries** via `pg`.
- **XSS:** React escapes text by default; still avoid injecting unsanitized HTML from model output if you extend the UI.
- **CSRF:** Same-site cookies and same-origin deployment reduce classic CSRF; cross-site deployments should follow Better Auth guidance on **SameSite** cookie policies and trusted origins.
- **IDOR:** Admin-only mutations check `requireAdmin`; user-specific row access should be audited if new per-user resources are added.
- **Secrets:** Use **Doppler** or OS-level secret stores; never commit `.env`.
- **Dependencies:** Run `npm audit` in `backend` and `frontend` periodically; no automated Dependabot configuration is included by default.

### Prompt injection defenses

The application ships a seven-module layered defense pipeline specifically designed to counter indirect prompt injection through document context. All defenses are independently toggleable from the Defenses admin page.

| Defense | Stage | Primary attack countered |
|---|---|---|
| Encoding & Obfuscation Detector | Input (pre-LLM) | Base64/hex/ROT13 encoded attack payloads |
| Semantic Trigger Detector | Input (pre-LLM) | Indirect injection via authority/bypass framing and planted response strings |
| Canary Word Verification | Input (pre-LLM) | Payload splitting; large-context burial |
| Prompt Sandwiching | Input (pre-LLM) | All injection types — separates trusted user instructions from untrusted document content with explicit XML tags |
| LLM-as-Judge | Output (post-LLM) | All injection types — secondary LLM evaluates the primary response for compliance echo, persona hijack, data exfiltration |
| DLP Filter | Output (post-LLM) | Data exfiltration (API keys, PII, credentials) |
| Session Turn Tracker | Output (post-LLM) | Multi-turn escalation attacks |

**Defense hardening (Week 15 — 14 May 2026):** Four implementation gaps were found and fixed before the final presentation:

1. **Encoding Detector:** `INJECTION_KEYWORDS_IN_DECODED` expanded from 5 to 25 patterns to cover corporate-synonym substitutions that the fuzzer produces. A second blocking path was added: any document that contains a valid Base64/hex block paired with corporate-framed decode-apply instructions is blocked regardless of keyword matches.

2. **Semantic Trigger Detector:** Four authority patterns and twelve bypass patterns were added to cover the exact language used by the legal, IT, HR, and finance-split InfoBank documents. This includes "planted response string" detection — the clearest injection signal, where a document explicitly tells the LLM what confirmation phrase to output (e.g., `"The confirmation response for pre-vetted vendor requests ... is: '...'"` or `"The required acknowledgement for EAF requests is: '...'"` or `"append the confirmation notation 'Approved'"`) — and structural bypass patterns such as "without returning to the legal review stage" and "verification sequence is replaced." The hard-block condition was simplified from four signals (authority + bypass + citations + strong bypass) to three (authority + bypass + strong bypass), removing the citation gate that several real attack documents did not satisfy.

3. **LLM-as-Judge:** Rule 3c — **Injection Compliance Echo** — was added to the judge's prompt. It blocks responses that output an unsolicited bureaucratic confirmation phrase that does not answer the user's question and appears to have been lifted from document context. Rule 5 (default-to-safe when uncertain) was explicitly qualified not to override Rule 3c.

4. **Session Turn Tracker:** Fixed a bug where the `lengthDecreaseSignal` was computed but never added to `totalSignals`, making it inoperative. Dramatic response-shortening now correctly counts toward the escalation threshold.

**Defense economics:** The LLM Judge makes a second LLM call; all other defenses are deterministic and add negligible latency. The pipeline uses a fail-open policy — if any defense throws an unexpected error it logs the error and continues rather than blocking all responses.

## Known Issues & Limitations

- **In-memory documents:** Uploaded files are stored in a **server process Map** (`documentService`); they are **lost on restart** and are not automatically synchronized with the SQL `documents` table used in schema/migrations.
- **Documents API vs schema drift:** PostgreSQL defines a `documents` table, but the hot path for chat/stress tests reads the **in-memory** service only.
- **`JWT_*` env names:** Appear only as **comments** in `env.example`; Better Auth uses session cookies — do not assume bearer JWT middleware is active.
- **Frontend port:** The Vite dev server is pinned to `3000` (see `vite.config.ts`). Open `http://localhost:3000` in the browser during development.
- **`backend/test_better_auth.ts`:** Imports `./src/db/index`, which is **not present** in this tree — use `./src/config/database` or run after aligning the script; treat as a manual smoke-test stub unless fixed.

## Contributing Guide

1. **Fork** the repository on your Git hosting provider and **clone** your fork locally.
2. Create a **feature branch** from `main` (or the default branch): `git checkout -b feature/short-description`.
3. Make focused commits with **clear, imperative subject lines** (e.g. `Fix SSE error handling in stress test`).
4. Run `**npm run build`** in `frontend` and `**npm run build**` in `backend` before opening a PR to ensure TypeScript compiles.
5. Open a **pull request** describing motivation, scope, and risk; link issues if applicable.

**Code style:** No repository-wide ESLint/Prettier config was found; match existing formatting (2-space indent, semicolons as in neighboring files). Prefer **small diffs** over wide refactors.

**Commit messages:** Use the imperative mood (`Add`, `Fix`, `Update`), optionally with a scope prefix (`server:`, `frontend:`).

## License

This project is released under the **MIT License** (**SPDX-License-Identifier: MIT**), as stated in `LICENSE`.

You may use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software subject to the conditions of the MIT license text, including retaining the copyright notice in distributions.