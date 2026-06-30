# Security Findings

## Scope

This document captures a focused critique of the current web app from defensive security, authentication, and networking perspectives, including:

- what has already been improved,
- remaining loopholes that can be fixed next,
- structural limitations that are currently accepted,
- and unresolved items.

---

## Improvements Already Implemented

- Added baseline HTTP hardening middleware (`helmet`) and disabled `x-powered-by`.
- Added auth and LLM route throttling with `express-rate-limit`.
- Tightened CORS from single static origin to explicit allowlist parsing (`FRONTEND_URLS` / `FRONTEND_URL`) with restricted methods/headers.
- Added refresh-token lifecycle endpoints:
  - `POST /api/auth/refresh`
  - `POST /api/auth/logout`
  - `POST /api/auth/logout-all`
- Added session-backed refresh storage with hashed token records (`auth_sessions`).
- Added lockout-related account fields and login event capture (`failed_login_count`, `locked_until`, `login_events`).
- Added security audit trail schema (`audit_log`) and writes for login/refresh/logout flows.
- Shifted user deletion semantics to soft-delete (`deleted_at`) in auth logic.
- Improved DB TLS defaults to avoid always-insecure verification in production.

---

## Current Loopholes and Risks

## Critical

- **Access token still stored in `localStorage`**
  - Current frontend still reads/writes `auth_token` in localStorage.
  - Any successful XSS can extract bearer tokens.
  - This is the largest remaining auth-side exposure.

- **Refresh rotation is not transactionally enforced**
  - Refresh flow currently performs read/revoke/new-session in separate operations.
  - Parallel refresh requests can create race windows for duplicate valid rotations.

## High

- **No explicit CSRF control layer for cookie-auth endpoints**
  - Refresh/logout rely on cookies.
  - `SameSite` helps, but there is no explicit CSRF token mechanism or strict Origin/Referer policy middleware.

- **Validation is still ad-hoc in many endpoints**
  - Most routes validate required fields only.
  - No centralized schema validation (shape, bounds, enum strictness, unknown-key rejection).

- **Upload validation is extension-based**
  - Upload gate checks `.txt` extension only.
  - MIME and content verification are not enforced.

## Medium

- **Rate limiting remains coarse (primarily IP/window)**
  - No account-aware adaptive throttling or risk-scored controls.
  - Behavior behind reverse proxies depends on deployment trust settings.

- **JWT policy is minimal**
  - Expiration exists, but stronger claim discipline and key rotation policy are not fully implemented.

- **CORS allows requests with missing Origin**
  - Acceptable for non-browser clients, but broader than strict browser-only trust assumptions.

- **Operational logs may expose internals**
  - DB layer logs query snippets/errors; redaction and structured security logging policy are not fully implemented.

---

## Structural Limitations (Accepted for Current Project Shape)

- **Runtime architecture still has in-memory characteristics in document workflows**
  - Limits durability guarantees and deep forensic replay.
  - A full persistence-first runtime would require larger service-layer refactor.

- **No security observability pipeline**
  - Security tables exist, but there is no alerting, SIEM forwarding, detection rules, or retention automation.

- **Infrastructure network controls are out-of-band**
  - WAF, mTLS, egress allowlists, hardened ingress, and zero-trust segmentation are deployment-layer concerns not fully represented in app code.

---

## What Was Not Solved in This Pass

- Did not remove localStorage token use completely (still present).
- Did not implement CSRF tokens or strict origin-check middleware for cookie-auth routes.
- Did not wrap refresh-token rotation in a single DB transaction with row locking.
- Did not add full centralized request validation across all API routes.
- Did not add MIME/content-based upload verification.
- Did not implement log redaction policy and security event retention jobs.
- Did not implement enterprise network perimeter controls in repository code.

---

## Suggested Next Priority (Fix Order)

1. Move access token to memory-only handling and stop persisting bearer token in localStorage.
2. Add transactional refresh rotation (`SELECT ... FOR UPDATE` + atomic revoke/issue).
3. Add CSRF + strict origin checks for cookie-auth state-changing endpoints.
4. Introduce centralized schema validation middleware across all write endpoints.
5. Harden upload verification (MIME/content checks) and add optional scanning pipeline.
6. Add security logging/redaction policy and event retention.
