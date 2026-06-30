-- Neon PostgreSQL Schema for Prompt Injection Defense Lab
-- Run this in Neon SQL Editor or via psql

-- ─────────────────────────────────────────────────────────
-- USERS & AUTH
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name  TEXT,
    role          TEXT NOT NULL DEFAULT 'user'
                    CHECK (role IN ('admin', 'user')),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    failed_login_count INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    password_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    image TEXT
);

-- Refresh tokens — one row per issued refresh token.
-- Allows per-device logout and full token revocation.
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,   -- bcrypt/SHA-256 of the raw token
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,            -- NULL = still valid
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auth sessions (refresh token rotation + revocation)
CREATE TABLE IF NOT EXISTS auth_sessions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id         UUID NOT NULL UNIQUE,
    refresh_token_hash TEXT NOT NULL UNIQUE,
    ip_address         INET,
    user_agent         TEXT,
    issued_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at         TIMESTAMPTZ NOT NULL,
    rotated_at         TIMESTAMPTZ,
    revoked_at         TIMESTAMPTZ
);

-- Better Auth tables
CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY,
    "expiresAt" TIMESTAMP NOT NULL,
    token TEXT NOT NULL UNIQUE,
    "createdAt" TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS account (
    id TEXT PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP,
    "refreshTokenExpiresAt" TIMESTAMP,
    scope TEXT,
    password TEXT,
    "createdAt" TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS verification (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    "expiresAt" TIMESTAMP NOT NULL,
    "createdAt" TIMESTAMP,
    "updatedAt" TIMESTAMP
);

-- Login security events (lockout/forensics support)
CREATE TABLE IF NOT EXISTS login_events (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    email_attempted TEXT,
    success BOOLEAN NOT NULL,
    ip_address INET,
    user_agent TEXT,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit trail for security-sensitive operations
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    outcome TEXT,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────
-- DOCUMENTS (persistent, replaces the in-memory Map)
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS documents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    content     TEXT NOT NULL,
    is_poisoned BOOLEAN NOT NULL DEFAULT FALSE,
    attack_type TEXT,                            -- FK-like ref to PRESET_ATTACKS id
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────
-- ATTACKS (persistent attack library)
-- Benign baseline is not stored here; stress tests add it in-memory when requested.
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS attacks (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    description    TEXT NOT NULL,
    injection_text TEXT NOT NULL,
    category       TEXT NOT NULL
                     CHECK (category IN ('override','leak','refuse','jailbreak','obfuscation','indirect','escalation')),
    tier           TEXT NOT NULL DEFAULT 'basic'
                     CHECK (tier IN ('basic','intermediate','advanced')),
    how_it_works   TEXT,
    mechanism      TEXT,
    impact         TEXT,
    example        TEXT,
    is_built_in    BOOLEAN NOT NULL DEFAULT FALSE,
    created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────
-- INDEXES — users, tokens, documents, attacks
-- ─────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_users_email       ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role        ON users(role);
CREATE INDEX IF NOT EXISTS idx_refresh_user      ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_expires   ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_active ON auth_sessions(user_id, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_login_events_user_created ON login_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_events_success ON login_events(success, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_created ON audit_log(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action_created ON audit_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_user    ON documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_documents_poisoned ON documents(is_poisoned);
CREATE INDEX IF NOT EXISTS idx_attacks_category  ON attacks(category);
CREATE INDEX IF NOT EXISTS idx_attacks_tier      ON attacks(tier);
CREATE INDEX IF NOT EXISTS idx_attacks_builtin   ON attacks(is_built_in);

-- ─────────────────────────────────────────────────────────
-- TABLE COMMENTS
-- ─────────────────────────────────────────────────────────

COMMENT ON TABLE  users                      IS 'Application users. role = admin | user. Admin-creates-users flow; no public signup.';
COMMENT ON COLUMN users.password_hash        IS 'bcrypt hash (cost factor ≥ 12). Never store plaintext.';
COMMENT ON COLUMN users.is_active            IS 'Set FALSE to deactivate without deleting the account.';
COMMENT ON COLUMN users.created_by           IS 'The admin who created this account. NULL for the bootstrap admin.';
COMMENT ON COLUMN users.failed_login_count   IS 'Consecutive login failures, used to trigger temporary lockout.';
COMMENT ON COLUMN users.locked_until         IS 'Login blocked until this timestamp after repeated failures.';
COMMENT ON COLUMN users.deleted_at           IS 'Soft-delete marker for account lifecycle and auditability.';

COMMENT ON TABLE  refresh_tokens             IS 'Issued JWT refresh tokens. Revoke by setting revoked_at.';
COMMENT ON COLUMN refresh_tokens.token_hash  IS 'Store a hash of the raw token, not the token itself.';
COMMENT ON TABLE  auth_sessions              IS 'Rotating refresh-token sessions with revocation and device metadata.';
COMMENT ON TABLE  login_events               IS 'Login attempts for lockout and incident analysis.';
COMMENT ON TABLE  audit_log                  IS 'Security and admin action trail.';

COMMENT ON TABLE  documents                  IS 'Uploaded documents, persisted to DB instead of in-memory Map.';
COMMENT ON COLUMN documents.attack_type      IS 'Matches an id from PRESET_ATTACKS in shared/attacks.ts when is_poisoned = TRUE.';

-- ─────────────────────────────────────────────────────────
-- TEST RUNS
-- ─────────────────────────────────────────────────────────

-- Test Runs Table
CREATE TABLE IF NOT EXISTS test_runs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    status VARCHAR(50),
    total_tests INTEGER DEFAULT 0,
    passed_tests INTEGER DEFAULT 0,
    failed_tests INTEGER DEFAULT 0,
    configuration JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Test Results Table
CREATE TABLE IF NOT EXISTS test_results (
    id SERIAL PRIMARY KEY,
    test_run_id INTEGER REFERENCES test_runs(id) ON DELETE CASCADE,
    test_case_id VARCHAR(100) NOT NULL,
    attack_id VARCHAR(50),
    llm_provider VARCHAR(50),
    prompt TEXT NOT NULL,
    response TEXT NOT NULL,
    expected_behavior VARCHAR(50),
    actual_behavior VARCHAR(50),
    success BOOLEAN,
    execution_time_ms INTEGER,
    token_count INTEGER,
    defense_ids TEXT[],
    defense_state JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Metrics Table
CREATE TABLE IF NOT EXISTS metrics (
    id SERIAL PRIMARY KEY,
    test_run_id INTEGER REFERENCES test_runs(id) ON DELETE CASCADE,
    attack_type VARCHAR(50),
    defense_id VARCHAR(50),
    llm_provider VARCHAR(50),
    total_tests INTEGER,
    passed_tests INTEGER,
    failed_tests INTEGER,
    true_positives INTEGER,
    false_positives INTEGER,
    true_negatives INTEGER,
    false_negatives INTEGER,
    accuracy DECIMAL(10, 4),
    precision DECIMAL(10, 4),
    recall DECIMAL(10, 4),
    f1_score DECIMAL(10, 4),
    tpr DECIMAL(10, 4),
    fpr DECIMAL(10, 4),
    avg_execution_time_ms DECIMAL(10, 2),
    min_execution_time_ms DECIMAL(10, 2),
    max_execution_time_ms DECIMAL(10, 2),
    avg_token_count DECIMAL(10, 2),
    attack_success_rate DECIMAL(10, 4),
    defense_effectiveness DECIMAL(10, 4),
    calculated_at TIMESTAMP DEFAULT NOW()
);

-- Behavioral Patterns Table (for behavioral defense)
CREATE TABLE IF NOT EXISTS behavioral_patterns (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100),
    response_type VARCHAR(50),
    response_length INTEGER,
    token_count INTEGER,
    response_time_ms INTEGER,
    anomaly_score DECIMAL(5, 4),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_test_results_run ON test_results(test_run_id);
CREATE INDEX IF NOT EXISTS idx_test_results_provider ON test_results(llm_provider);
CREATE INDEX IF NOT EXISTS idx_test_results_attack ON test_results(test_case_id);
CREATE INDEX IF NOT EXISTS idx_test_results_attack_id ON test_results(attack_id);
CREATE INDEX IF NOT EXISTS idx_test_results_success ON test_results(success);
CREATE INDEX IF NOT EXISTS idx_metrics_run ON metrics(test_run_id);
CREATE INDEX IF NOT EXISTS idx_metrics_attack ON metrics(attack_type);
CREATE INDEX IF NOT EXISTS idx_metrics_defense ON metrics(defense_id);
CREATE INDEX IF NOT EXISTS idx_metrics_provider ON metrics(llm_provider);
CREATE INDEX IF NOT EXISTS idx_behavioral_session ON behavioral_patterns(session_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_status ON test_runs(status);
CREATE INDEX IF NOT EXISTS idx_test_runs_started ON test_runs(started_at DESC);

-- ─────────────────────────────────────────────────────────
-- ASYNC JOBS (long-running server work: stress tests, future ETL, etc.)
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS async_jobs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type            VARCHAR(64) NOT NULL,
    status              VARCHAR(32) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'running', 'completed', 'cancelled', 'failed')),
    cancel_requested    BOOLEAN NOT NULL DEFAULT FALSE,
    input_payload       JSONB NOT NULL DEFAULT '{}',
    progress            JSONB NOT NULL DEFAULT '{}',
    result_summary      JSONB,
    error_message       TEXT,
    linked_test_run_id  INTEGER REFERENCES test_runs(id) ON DELETE SET NULL,
    label               TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_async_jobs_status    ON async_jobs(status);
CREATE INDEX IF NOT EXISTS idx_async_jobs_created   ON async_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_async_jobs_type      ON async_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_async_jobs_test_run  ON async_jobs(linked_test_run_id);

COMMENT ON TABLE async_jobs IS 'Trackable, cancelable long-running jobs that perform DB writes (e.g. stress tests)';
COMMENT ON COLUMN async_jobs.cancel_requested IS 'Set by DELETE/client or POST /cancel; worker polls and stops gracefully';
COMMENT ON COLUMN async_jobs.metadata IS 'User-editable tags/notes merged via PATCH';
COMMENT ON COLUMN async_jobs.progress IS 'Live counters: current, total, passed, failed, lastResultId, etc.';

-- Comments for documentation
COMMENT ON TABLE test_runs IS 'Stores information about each test execution session';
COMMENT ON TABLE test_results IS 'Individual test case results with full details';
COMMENT ON TABLE metrics IS 'Aggregated metrics and statistics calculated from test results';
COMMENT ON TABLE behavioral_patterns IS 'Tracks response patterns for behavioral anomaly detection';

COMMENT ON COLUMN test_runs.configuration IS 'JSONB storing test configuration (attack types, defenses, LLM providers, etc.)';
COMMENT ON COLUMN test_results.defense_state IS 'JSONB storing defense execution state and flags';
COMMENT ON COLUMN metrics.tpr IS 'True Positive Rate (Sensitivity/Recall)';
COMMENT ON COLUMN metrics.fpr IS 'False Positive Rate';
COMMENT ON COLUMN metrics.f1_score IS 'F1 Score (harmonic mean of precision and recall)';

-- Sample query to verify setup
SELECT 'users'               AS table_name, COUNT(*) AS row_count FROM users
UNION ALL
SELECT 'refresh_tokens'      AS table_name, COUNT(*) AS row_count FROM refresh_tokens
UNION ALL
SELECT 'auth_sessions'       AS table_name, COUNT(*) AS row_count FROM auth_sessions
UNION ALL
SELECT 'login_events'        AS table_name, COUNT(*) AS row_count FROM login_events
UNION ALL
SELECT 'audit_log'           AS table_name, COUNT(*) AS row_count FROM audit_log
UNION ALL
SELECT 'documents'           AS table_name, COUNT(*) AS row_count FROM documents
UNION ALL
SELECT 'test_runs'           AS table_name, COUNT(*) AS row_count FROM test_runs
UNION ALL
SELECT 'test_results'        AS table_name, COUNT(*) AS row_count FROM test_results
UNION ALL
SELECT 'metrics'             AS table_name, COUNT(*) AS row_count FROM metrics
UNION ALL
SELECT 'behavioral_patterns' AS table_name, COUNT(*) AS row_count FROM behavioral_patterns
UNION ALL
SELECT 'async_jobs' AS table_name, COUNT(*) AS row_count FROM async_jobs;
