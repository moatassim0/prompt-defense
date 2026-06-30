# Thoughts.md
> Running log of project analysis, decisions, risks, and enhancement ideas.
> Updated at the end of every phase. This is a living document — not a spec.
> Authoritative planning is in `project_strategy.md` and `PLAN.md`.

---

## Phase 1 — Post-Mortem (Completed ✅)

### What Phase 1 delivered
- Full JWT authentication backend (`auth.ts`) — login, register, `/me`, user list, delete
- Role-separated navigation — admin lands on Analytics, user lands on Chat
- Seed accounts on startup (`seedDefaultAccounts()` in `migrate.ts`)
- `.env` fully populated — `JWT_SECRET`, `JWT_EXPIRES_IN`, `FRONTEND_URL`, `NODE_ENV` all present
- Toast system replacing all `alert()` calls
- `ConfirmModal` replacing all `confirm()` calls, including in `UserManagementPage.tsx`
- Dev credentials hint removed from `LoginPage.tsx`
- PLAN.md updated to reflect 100% Phase 1 completion

### What PLAN.md got right vs. brainstorm
Everything in Phase 1 is correctly derived from the brainstorm's Item #1 (User Auth). The locked
architectural decisions (Decision #1–#8) are mostly reasonable departures from the brainstorm,
made deliberately to reduce scope and focus on the research angle.

---

## Brainstorm vs. PLAN.md — Alignment Check

> Performed after Phase 1 completion. This is mandatory after every phase.

### ✅ Aligned items (brainstorm intent carried into PLAN.md correctly)

| Brainstorm Item | How it landed in PLAN.md |
|-----------------|--------------------------|
| #1 — JWT + roles | Phase 1, fully done |
| #3 — Admin landing = Analytics | Decision #6, done |
| #5 — Stress Test rebrand + configurable params | Phase 2.5 |
| #8 — UI: toasts, skeleton loaders, animations | Phase 3.2, partially done |
| #9 — CORS lock-down, helmet, rate limiting | Phase 3.1, partially done |
| #10 — Error handling, QA | Phase 4.1 |
| #11 — Final polish, deploy | Phase 4.3 |
| #12 — Simulation History | Phase 2.3 |
| #13 — Defense Effectiveness Scoring | Phase 2.4 |
| #16 — Audit Log | Phase 3.3 |
| #19 — Swagger/OpenAPI | Phase 4.2 |

---

### ⚠️ Deliberate Divergences (not errors — documented decisions)

**Brainstorm #4 (Defer LLM Compare) → PLAN.md reversed it**
- Brainstorm said: hide or remove `LLMComparisonPage`
- PLAN.md Decision #8: keep it and fix it (it is a core research feature)
- Assessment: correct call. For a thesis on prompt injection across models, multi-LLM comparison is
  the highest-value research output. Hiding it would have been a regression.

**Brainstorm #17 (PDF/DOCX support) → PLAN.md hard-blocked it**
- PLAN.md Decision #7: .txt only, forever
- Assessment: correct call. The thesis is about prompt injection, not file parsing. Adding
  `pdf-parse` / `mammoth` would expand scope with zero research benefit.

**User access to Simulator → PLAN.md restricts to Chat + Documents**
- Brainstorm Item #1 table shows Simulator: ✅ for User
- But the same brainstorm item also says "User: limited access — interacts with the chat section
  and documents section" — a contradiction within the brainstorm itself
- PLAN.md Decision #5 resolves this in favor of "Chat + Documents only"
- Assessment: reasonable. Users are study participants. Giving them the Simulator would let them
  see and manipulate attack configs — that is the researcher's job.

---

### 🔴 Gaps — Items in the brainstorm NOT addressed in PLAN.md

**Gap #1 — Brainstorm #2: Defenses as a system-wide admin config (SIGNIFICANT)**

The brainstorm was explicit:
> "Defenses are a system-level setting managed by the admin, not a per-session toggle for users."
> "Add a `system_config` table or use a config record in the DB to persist active defenses."

The current implementation has defenses as ephemeral per-session toggles in the frontend
`App.tsx` state. Every time the page refreshes or the admin logs out, the defense configuration
is lost. There is no DB persistence for which defenses are "globally active".

**Impact:** This is a research fidelity issue. The thesis presumably wants to describe a system
where an admin can deploy defenses and they stay deployed. Currently the system has no concept of
"production state vs. test state".

**Recommended action:** Add a `system_config` table (single row, JSONB column) that persists the
active defense IDs. Admin changes update this row. The Simulator still has its own local overrides
for "what-if" testing without changing the live config. This is Phase 2 scope.

**Gap #2 — Brainstorm #6: Attacks page merged into Simulator**

The brainstorm said:
> "Remove the standalone Attacks page from user-facing nav."
> "Attacks become a 'library' that feeds the Simulator, not a standalone feature."

The current PLAN.md keeps the standalone Attacks page as a full admin nav item. The Simulator
does have attack selection built in (the merge partially happened), but the Attacks page was
never removed. It now serves as an "attack library" view — which is actually useful as read-only
reference. The real question is: does it need to be editable?

**Recommended action:** Keep the Attacks page but reframe it as a read-only "Attack Library"
(reference material for understanding each attack). Move the "activate for global use" action
into the Simulator only. This aligns the brainstorm's intent (Simulator-centric UX) while
keeping the documentation value of the dedicated page.

**Gap #3 — Brainstorm #14: Custom Attack Builder (admin only)**

Not in PLAN.md at all. Attacks are hardcoded in `shared/attacks.ts`. An admin cannot create
new attacks through the UI — they would need to edit source code.

**Impact:** Moderate. For a thesis demo, the 6 preset attacks are probably sufficient. But for
extensibility (and the brainstorm's "evaluators can create their own test cases" point), this
is a gap.

**Recommended action:** Add to Phase 2 as an optional item. A simple form (name, category,
injection payload text) that writes to a `custom_attacks` DB table would take half a day and
dramatically improve demo flexibility.

**Gap #4 — Brainstorm #15: Exportable PDF Reports**

Not in PLAN.md. The brainstorm described generating a PDF security assessment report from the
Simulator or Analytics page.

**Impact:** Low for functionality, high for thesis presentation. A printed/exported report with
the system's findings is a strong thesis appendix artifact.

**Recommended action:** Defer to Phase 4. Use browser `window.print()` with a print stylesheet
before reaching for `jsPDF` or similar — it is simpler and produces good results for basic
reports.

---

### 🟡 Minor Observations

**CHANGES.md Session 4 (4.6) describes user nav as: Simulator + Chat + Documents**
The current code has Chat + Documents only. CHANGES.md is now slightly stale on this point.
This does not need to be "fixed" but should be noted — CHANGES.md entries are historical records,
not current state, so leaving them as-is is correct.

**`POST /api/auth/register` behavior**
The brainstorm said: "Admin creates user accounts. Or self-registration with default user role?"
PLAN.md Decision #3 says registration always creates admin. But the endpoint is PUBLIC when zero
users exist, then requires admin JWT after that — so in practice, anyone can register ONLY
before any account exists. After the first admin exists, only logged-in admins can create accounts.
This is the right behavior but it is not clearly documented anywhere in the UI.

---

## Next Move — Phase 2 Planning

### Priority order for Phase 2

The PLAN.md Phase 2 order is:
1. Wire `semantic` defense
2. Wire `behavioral` defense
3. Wire `consensus` defense
4. Fix LLM Compare
5. Simulation history
6. Effectiveness scoring
7. Stress Test configurable params

**Recommended reorder based on research value and dependency chain:**

```
Step 1 → Fix LLM Compare (2.2)
  Why: The LLM Compare page is currently LYING — it shows three results labeled as different
  providers but they all come from Cerebras. This is the most embarrassing live bug. Fixing it
  first gives the project integrity before demos.

Step 2 → Wire semantic defense (2.1a)
  Why: It is the most self-contained — no external dependencies. The service is fully built.
  Wiring it in is a few dozen lines. Removes "Coming Soon" from the first defense.

Step 3 → Wire behavioral defense (2.1b)
  Why: Also self-contained. Welford's algorithm runs in-process, no external services needed.

Step 4 → Simulation history + effectiveness scoring (2.3 + 2.4)
  Why: These are tightly coupled — saving each run and scoring each run should be built together.
  They are the highest research-value items in the entire project (quantitative defense data).

Step 5 → Wire consensus defense (2.1c)
  Why: Last because it requires ≥2 API keys. It should not block the other items.
  Add OPENAI_API_KEY or ANTHROPIC_API_KEY to .env, then wire it.

Step 6 → Stress Test config params (2.5)
  Why: The page works. This is a parameter-passing exercise. Lower urgency.
```

---

## Loopholes & Risks Found

### Security

**Risk 1 — JWT_SECRET is too guessable**
The current `.env` has:
```
JWT_SECRET=prompt-injection-lab-jwt-secret-change-before-deploy
```
This is a passphrase, not a cryptographic secret. Before any deployment (even staging), it must
be replaced with at least 64 bytes of random hex:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
The warning comment "change-before-deploy" is good but easy to miss.

**Risk 2 — No rate limiting on LLM endpoints**
`POST /api/query` and `POST /api/comparison` both make paid Cerebras API calls. There is no
rate limiting. A logged-in user (even with the `user` role) can loop these endpoints and burn
through API credits. `express-rate-limit` is a 5-minute fix.

**Risk 3 — No `helmet` headers**
The backend sends no security headers. XSS, clickjacking, and MIME sniffing protections are all
absent. `app.use(helmet())` takes one line.

**Risk 4 — bcrypt in migrate.ts on server startup**
`seedDefaultAccounts()` hashes two passwords with 12 bcrypt rounds every time the server
starts — but only inserts them if they don't exist (ON CONFLICT DO NOTHING). The hashing still
runs even when the accounts already exist. On a cold start this adds ~1 second. Not a bug but
worth optimizing: check if accounts exist first, skip hashing if they do.

**Risk 5 — Consensus defense requires multiple paid API keys**
`consensus-defense.service.ts` queries multiple LLM providers in parallel. If configured
incorrectly or if keys are missing, this could either silently fail or throw. Need graceful
degradation: if <2 providers are configured, consensus defense disables itself and logs a warning
rather than crashing.

### Data & State

**Risk 6 — Documents are in-memory only (by design)**
Restarting the server wipes all uploaded documents. For a demo, this means the presenter must
re-upload documents every session. If the demo machine loses power mid-presentation, documents
are gone. A pre-upload script (or a "load sample documents" button) would mitigate this.

**Risk 7 — Attack state is frontend-only**
`activeAttack` lives in `App.tsx` state. If the admin activates an attack, logs out, and another
admin logs in, the attack state is reset. This is probably fine for a controlled lab demo, but
worth knowing.

**Risk 8 — No token refresh mechanism**
JWTs expire in 24 hours. There is no refresh token endpoint implemented despite the
`refresh_tokens` table existing in the schema. When a token expires, the user is silently logged
out on next request (the 401 interceptor clears the session). The 24h window is long enough for
a demo but would be an issue in production.

---

## Enhancement Ideas

### High impact, low effort

**Idea 1 — "Load Sample Documents" button**
A single button on the DocumentsPage that uploads the example files from `/examples/` via
the existing upload endpoint. This makes demos instant and reproducible. Two API calls, one
button.

**Idea 2 — Defense effectiveness badge on Defenses page**
Pull the latest analytics data and show each defense's average effectiveness score as a badge
on its card. Admin can see at a glance: "Sanitization — 87% effective across 142 runs."
This requires simulation history (Phase 2.4) to exist first.

**Idea 3 — "Quick Run" presets in Simulator**
Dropdown of pre-configured scenarios (e.g., "Classic Jailbreak vs. Isolation Defense"). Loads
prompt, attack, and defense selection with one click. Makes demos fluid without requiring the
presenter to configure everything live.

**Idea 4 — bcrypt seeding optimization**
Before hashing in `seedDefaultAccounts()`, check if the accounts already exist. Skip both the
hash computation and the INSERT if they do. Cold starts will be noticeably faster.

### Medium impact, medium effort

**Idea 5 — System config persistence for defenses**
Implement the brainstorm's Item #2 properly: add a `system_config` table with a single JSONB
row that persists `activeDefenseIds`. Admin defense toggles update this row. This gives the
system the "globally deployed defense" semantics that the thesis presumably describes.

**Idea 6 — Per-run defense effectiveness in Analytics**
After Phase 2.4 (effectiveness scoring), add a chart to AnalyticsPage: "Defense Effectiveness
Over Time" — a line chart showing how the Jaccard similarity score trends across the last N runs
for each defense. Shows whether iterative attack improvements eventually break the defense.

**Idea 7 — Attack severity heatmap**
The brainstorm's Item #18. A simple grid: attacks (rows) × defenses (columns), color-coded by
effectiveness score from the analytics DB. Shows at a glance which attack + defense combinations
are dangerous. Pure CSS grid — no chart library needed.

**Idea 8 — Custom Attack Builder (Gap #3 above)**
Admin form to create new attacks. Name, category, severity dropdown, injection text. Stored in
a `custom_attacks` DB table, returned by the GET /api/attacks endpoint alongside the presets.
This makes the system genuinely extensible for the thesis evaluators.

### Lower priority

**Idea 9 — Onboarding walkthrough**
First-time user sees a 3-step modal: "What is prompt injection? / How do attacks work? / How
do defenses work?" With Skip button. Uses localStorage to track "seen" state. Aligns with
brainstorm Item #8.

**Idea 10 — Print-friendly report from Simulator**
After a simulation run, a "Generate Report" button triggers `window.print()` with a print
stylesheet that hides the nav/header and formats the 3-column results as a clean A4 report.
No PDF library needed. Covers brainstorm Item #15 at zero dependency cost.

---

## Technical Debt Tracker

| Item | File | Severity | Notes |
|------|------|----------|-------|
| `LLMComparisonPage.tsx` always hits Cerebras | `LLMComparisonPage.tsx`, `server.ts` | 🔴 High | Phase 2.2 — must fix |
| `semantic`/`behavioral`/`consensus` defenses not wired | `defense.service.ts` | 🟠 Medium | Phase 2.1 |
| No rate limiting on LLM endpoints | `server.ts` | 🔴 High | One `express-rate-limit` call |
| No `helmet` headers | `server.ts` | 🟠 Medium | One line |
| JWT_SECRET is a passphrase not a crypto secret | `.env` | 🔴 High (before deploy) | Replace before demo |
| bcrypt runs on every startup even if seeds exist | `migrate.ts` | 🟡 Low | Optimize with existence check |
| No token refresh | `auth.ts` | 🟡 Low | 24h window fine for demo |
| No error boundaries in React | Frontend | 🟠 Medium | A broken component crashes the page |
| Simulation state (attack active) not persisted | `App.tsx` | 🟡 Low | Acceptable for demo |
| No input validation middleware | `server.ts` | 🟠 Medium | `express-validator` Phase 3 |

---

## Open Questions for the Researcher

1. **Defenses: per-session or globally persistent?**
   The brainstorm described defenses as globally configured by the admin and always on for all
   users. The current implementation uses per-session UI toggles. Which model aligns with the
   thesis's threat scenario? A globally deployed system with persistent defense config is more
   realistic; a per-session toggle is better for demo flexibility.

2. **Custom attacks: are 6 presets enough?**
   The thesis evaluators may want to test custom injection payloads. Does the researcher need
   to be able to create new attacks in the UI, or is modifying `shared/attacks.ts` acceptable?

3. **Consensus defense: which second LLM?**
   Consensus requires ≥2 providers. Do we have an OpenAI or Anthropic API key? If not, this
   defense cannot be activated. The "Coming Soon" badge will stay on it permanently until a
   second key is provided.

4. **Simulation history: per-user or global?**
   The brainstorm said "Admin sees global history; users see only their own." Is user-level
   history needed given that users only have Chat access (not the Simulator)?

5. **Audit log: is it needed for the thesis?**
   An audit log (every login, every simulation, every defense toggle) is in Phase 3. Is this
   a grading requirement or optional polish? If the former, it should be moved to Phase 2.

---

---

## Attack System Redesign — Post-Implementation Notes

### Phase 1: DB-backed attack library

The entire attack system was rebuilt from hardcoded presets to a DB-backed persistent library
with a custom attack builder.

**Before:** 6 attacks hardcoded in `shared/attacks.ts`. No persistence. No custom attacks.
The `GET /api/attacks` route returned a static array. The `Attack` type had 4 fields.

**After (Phase 1):** Attacks live in an `attacks` table in Neon PostgreSQL. The 6 presets are
seeded on startup. Admin can create and delete custom attacks through a builder UI.

### Phase 2: Tier-based escalation model (project_strategy.md Option 2)

The flat `severity`/`target`/`technique` model was replaced with a **tier-based escalation
system** aligned with the project strategy's Option 2 (Adversarial Attack Escalation).

**Before (Phase 1):** `Attack` had `severity`, `target`, `technique`, `expectedBehavior`,
`is_preset`. 6 preset attacks. `PRESET_ATTACKS` array with `ON CONFLICT DO NOTHING` seeding.

**After (Phase 2):** `Attack` has `tier` (basic/intermediate/advanced), `howItWorks`, `mechanism`,
`impact`, `example`, `isBuiltIn`. 11 seed attacks (6 basic + 3 intermediate + 2 advanced).
`SEED_ATTACKS` array with UPSERT seeding. Dedicated `AttackService` class with DB fallback.

### Files changed (Phase 2)

| File | Change |
|------|--------|
| `shared/types.ts` | `Attack` interface redesigned: replaced `severity`/`target`/`technique` with `tier`/`howItWorks`/`mechanism`/`impact`/`example`. Removed standalone type aliases. Category expanded: added `obfuscation`, `indirect`, `escalation`. |
| `shared/attacks.ts` | `PRESET_ATTACKS` → `SEED_ATTACKS`. 6 → 11 attacks. Added: Encoding (Base64), Payload Splitting, Context Overflow (intermediate); Indirect Injection, Multi-Turn Escalation (advanced). |
| `backend/src/services/attack.service.ts` | **NEW.** `AttackService` class: `getAllAttacks()`, `getAttackById()`, `createAttack()`, `deleteAttack()`. Falls back to `SEED_ATTACKS` if DB unavailable. |
| `backend/src/server.ts` | Attack CRUD routes refactored to use `AttackService`. Removed `GET /:id` and `PUT /:id` (update removed — built-ins auto-update via upsert). |
| `backend/src/db/migrate.ts` | Migration 008 rewritten: `tier` + `how_it_works` + `mechanism` + `impact` + `example` columns. `is_preset` → `is_built_in`. Seed uses `ON CONFLICT DO UPDATE` (upsert). |
| `frontend/src/services/api.ts` | `fetchWithRetry` helper added. `updateAttack` removed. `getAnalyticsSummary`/`exportAnalyticsCSV` added. |
| `frontend/src/App.tsx` | `handleUpdateAttack` removed. Create/delete handlers use tier model. |
| `frontend/src/components/AttacksPage.tsx` | Full rewrite: tier badges, educational detail modals (howItWorks/mechanism/impact/example), ConfirmModal for delete. |
| `frontend/src/App.css` | Drawer CSS renamed to centered modal. Old attack meta-badge styles removed. |
| `frontend/src/components/*.tsx` | Performance: `useCallback`/`useMemo` added to DocumentsPage, ChatInterface, AnalyticsPage, TestingPage, LLMComparisonPage. API centralized in AnalyticsPage and LLMComparisonPage. |
| `database/schema.sql` | Added `attacks` table with tier-based schema + indexes. |
| `testing/framework/test-case.ts` | Category union extended: `'obfuscation' | 'indirect' | 'escalation'`. |

### Design decisions (updated)

1. **Built-in attacks use UPSERT seeding.** The previous `ON CONFLICT DO NOTHING` meant seed
   updates were invisible. Now `ON CONFLICT DO UPDATE` ensures built-in attack metadata always
   reflects the latest `SEED_ATTACKS` array on startup.

2. **Tier replaces severity/target/technique.** The tier system (basic/intermediate/advanced)
   maps directly to the project strategy's escalation model. A scan result like "Resisted 6/6
   basic, 2/3 intermediate, 0/2 advanced — Risk: HIGH" is the goal.

3. **Educational fields.** Each attack now has `howItWorks`, `mechanism`, `impact`, and `example`
   — displayed in the detail modal. This serves the thesis's educational framing requirement.

4. **AttackService with DB fallback.** If the DB is unreachable, `getAllAttacks()` returns
   `SEED_ATTACKS` directly. This improves resilience over the Phase 1 approach.

5. **Custom attack IDs are slugified names.** Format: `name-lowercased-dashes`. Simpler than
   the previous `custom-{timestamp}-{random}` approach.

6. **No edit for attacks.** Built-in attacks auto-update via upsert. Custom attacks are simple
   enough to delete and recreate. This eliminated unnecessary UI and API complexity.

### Risks resolved from Phase 1

- ~~Seeding is idempotent but not updateable~~ → **Fixed.** UPSERT seeding now keeps built-in
  attacks current.
- ~~No input validation on technique/target enums~~ → **Resolved.** Simplified to `tier` and
  `category` with DB CHECK constraints. Frontend dropdowns match the constraint values exactly.

### What this unblocks

- **project_strategy.md Option 2** is now implemented (tiered attack escalation).
- Scan results can show per-tier vulnerability breakdown.
- Advanced attacks (indirect injection, multi-turn escalation) test real-world OWASP LLM01 scenarios.
- React performance optimizations reduce unnecessary re-renders across 5 components.
- API centralization eliminates duplicate axios imports in AnalyticsPage and LLMComparisonPage.

---

*Last updated: Tier-based attack redesign merged. Phase 2 continues — wiring defenses, quantitative scanning.*

---

## Security, Auth, Network, and Schema Uplift — Strategic Reflection

This pass shifts the project from "demo-safe defaults" to a production-aligned security posture while preserving current thesis workflow.

### Current-state assessment (before uplift)

- Auth was JWT-only with localStorage access token and no refresh lifecycle, despite refresh-token schema intent.
- `POST /api/auth/logout` existed in frontend API calls but was not implemented in backend.
- CORS accepted only one origin but had no explicit allowlist parser for multi-env workflows.
- Backend lacked baseline HTTP hardening middleware and request throttling for auth + paid LLM endpoints.
- DB TLS used `rejectUnauthorized: false` universally, which is risky for production networks.
- Runtime and schema had drift: refresh token table existed but no active session rotation/revocation model, no audit/login event trail.

### Uplift decisions implemented

1. **Auth lifecycle completion**
   - Added refresh-token rotation with server-side hashed session records.
   - Added `/api/auth/refresh`, `/api/auth/logout`, and `/api/auth/logout-all`.
   - Added login lockout primitives (`failed_login_count`, `locked_until`) and applied them in login flow.
   - Shifted user deletion to soft-delete semantics (`deleted_at`) for auditability.

2. **Security baseline**
   - Added `helmet`, `cookie-parser`, and route-level rate limits (auth and LLM-heavy endpoints).
   - Added stricter request guards for core prompt endpoints.
   - Added explicit CORS allowlist parsing from env (single or comma-separated origins), method/header restrictions.

3. **Network posture**
   - Updated DB TLS policy so certificate verification is expected in production unless explicitly disabled for controlled environments.
   - Preserved development flexibility while preventing insecure defaults from silently shipping.

4. **Schema alignment with strategy**
   - Added `auth_sessions` table for revocation and rotation-safe refresh handling.
   - Added `login_events` and `audit_log` tables for forensics and governance.
   - Added indexes for active-session lookup, expiry sweeps, and security event querying.
   - Synced migration path and canonical schema with the above direction.

### Fit with project strategy

- Supports platform vision (BYO enterprise security posture) by making account/session governance explicit.
- Improves thesis defensibility by replacing "planned security features" with implemented controls and measurable artifacts (audit/login events).
- Keeps implementation practical for current stage: access token + refresh-cookie hybrid model can coexist with current frontend while enabling future hardening.

### Recommended next enhancements (deferred)

- Move access token from localStorage to memory-only session handling after broader frontend contract cleanup.
- Add CSRF protection for state-changing auth routes as cookie-based auth reliance increases.
- Replace extension-only upload checks with MIME/content validation and optional malware scanning for enterprise mode.
- Introduce centralized request schema validation (`zod`/`express-validator`) across all write endpoints.
- Add security CI gates (dependency scanning, SAST, secret scanning) and explicit secret rotation runbook.

### Residual risks to track

- Session/audit tables now exist, but SOC-style reporting/alerting is still out of scope and should be added later if this evolves beyond thesis demo.

---

## Project Assessment: Graduation Project Viability & Next Steps

*Review conducted after implementing multi-signal evaluation, analytics fixes, and the Semantic Backdoor attack.*

### 🌟 Overall Assessment (Graduation Viability)
This is an **excellent and highly relevant graduation project**. It tackles one of the most pressing challenges in the tech industry today: **LLM Security, Prompt Injection, and Automated Red-Teaming**. 

Integrating LLMs is easy, but securing them is hard. Building a systematic framework to benchmark LLM vulnerability proves proficiency in both traditional software engineering (React, Node, PostgreSQL) and modern AI engineering (multi-signal evaluation, RAG poisoning, prompt engineering).

### 🏗️ Areas Needing Improvement (Action Items)

**1. Data Model & Architecture Fragility**
* **The Issue:** Recent bugs (like metrics double-counting and mismatched terminology between `expectedBehavior` and actual test output) showed that the data pipeline from "Test Execution" -> "Database Storage" -> "Analytics Dashboard" was fragile. Relying on implicit `NULL` conventions or loose string matching causes downstream analytics to break.
* **The Fix:** Ensure global standardization of TypeScript types across the stack. DB enums, backend service interfaces, and frontend UI states must share the exact same source of truth for test behaviors.

**2. Test Result Traceability**
* **The Issue:** The dashboard shows aggregate numbers (e.g., 63% success rate), but a security analyst using this tool needs to audit *why* an attack succeeded. 
* **The Fix:** Add a **"Failure Trace" or "Logs" view** in the frontend. Clicking on a failed defense test should reveal the exact malicious prompt, the exact defense state/reasoning, and the LLM's raw response. 

### 🚀 High-Impact Additions (To stand out)

**1. "LLM Firewall" Defense Mechanism**
* Currently, the system features incredibly advanced attacks (like *Semantic Backdoor* and *Progressive Trust*), but the defenses (like `prompt-sandwiching`) are relatively basic. 
* **Recommendation:** Implement an "LLM Firewall" Defense. Route incoming prompts through a smaller, fast model (like Llama-3-8B) with a strict system prompt to classify the input as `SAFE` or `MALICIOUS` *before* it reaches the main system. Compare its efficacy against traditional Prompt Sandwiching.

**2. Distributed RAG Poisoning (Split-Poisoning)**
* The `semantic-backdoor` attack is a great start for Data Poisoning / RAG attacks. 
* **Recommendation:** Push this further by implementing "Split-Poisoning." Plant half of a malicious instruction in Document A, and the other half in Document B. Show that when the LLM retrieves both, it combines them to execute an attack. Defending against this is a cutting-edge research problem.

**3. Baseline Comparisons (False Positive Tracking)**
* A defense that blocks 100% of attacks but also blocks 50% of legitimate user questions is a bad defense.
* **Recommendation:** Add "Benign" (safe) test cases to the stress tests. Measure the **False Positive Rate** in the metrics to prove the defenses aren't just aggressively blocking safe traffic.

### 🎯 Recommended Focus for Presentation

When preparing for the final defense/presentation, focus on **the story the data tells** rather than just adding more features:
1. **Stabilize:** Ensure tests run cleanly from 0 to 100 without crashing, and metrics are mathematically sound.
2. **The "Demo Story":** 
   - *Step 1:* Run the system with NO defenses → show the dashboard lighting up red (high vulnerability).
   - *Step 2:* Turn on a basic defense (Prompt Sandwiching) → show partial mitigation.
   - *Step 3:* Run a sophisticated attack (Semantic Backdoor) → show how it bypasses the basic defense.
3. **UX Polish:** Ensure loading states, error handling (like the recent Analytics page updates), and execution progress bars look professional and instil confidence in the tool's reliability.
