import dotenv from 'dotenv';
dotenv.config();

import bcrypt from 'bcryptjs';
import { query, closePool } from '../config/database';
import { deleteExpiredSessions } from '../lib/session-cleanup';
import { SEED_ATTACKS } from '../../../shared/attacks';
import { SEED_DEFENSES } from '../../../shared/defenses';

// Each migration is idempotent — safe to re-run.
// Matches database/schema.sql exactly. Run order matters for FK references.
const migrations: Array<{ name: string; sql: string }> = [

  // ── 001: Users ─────────────────────────────────────────────────────────────
  {
    name: '001_users',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        email         TEXT        UNIQUE NOT NULL,
        password_hash TEXT        NOT NULL,
        display_name  TEXT,
        role          TEXT        NOT NULL DEFAULT 'user'
                                  CHECK (role IN ('admin', 'user')),
        is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
        created_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login_at TIMESTAMPTZ,
        failed_login_count INTEGER NOT NULL DEFAULT 0,
        locked_until TIMESTAMPTZ,
        password_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);
    `,
  },

  // ── 002: Refresh tokens ────────────────────────────────────────────────────
  {
    name: '002_refresh_tokens',
    sql: `
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT        NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_refresh_user    ON refresh_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_refresh_expires ON refresh_tokens(expires_at);
    `,
  },

  // ── 003: Documents ─────────────────────────────────────────────────────────
  {
    name: '003_documents',
    sql: `
      CREATE TABLE IF NOT EXISTS documents (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        name        TEXT        NOT NULL,
        content     TEXT        NOT NULL,
        is_poisoned BOOLEAN     NOT NULL DEFAULT FALSE,
        attack_type TEXT,
        uploaded_by UUID        REFERENCES users(id) ON DELETE SET NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_documents_user    ON documents(uploaded_by);
      CREATE INDEX IF NOT EXISTS idx_documents_poisoned ON documents(is_poisoned);
    `,
  },

  // ── 004: Test runs ─────────────────────────────────────────────────────────
  {
    name: '004_test_runs',
    sql: `
      CREATE TABLE IF NOT EXISTS test_runs (
        id           SERIAL      PRIMARY KEY,
        name         VARCHAR(255) NOT NULL,
        description  TEXT,
        started_at   TIMESTAMP   DEFAULT NOW(),
        completed_at TIMESTAMP,
        status       VARCHAR(50),
        total_tests  INTEGER     DEFAULT 0,
        passed_tests INTEGER     DEFAULT 0,
        failed_tests INTEGER     DEFAULT 0,
        configuration JSONB,
        created_at   TIMESTAMP   DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_test_runs_status  ON test_runs(status);
      CREATE INDEX IF NOT EXISTS idx_test_runs_started ON test_runs(started_at DESC);
    `,
  },

  // ── 005: Test results ──────────────────────────────────────────────────────
  {
    name: '005_test_results',
    sql: `
      CREATE TABLE IF NOT EXISTS test_results (
        id                SERIAL      PRIMARY KEY,
        test_run_id       INTEGER     REFERENCES test_runs(id) ON DELETE CASCADE,
        test_case_id      VARCHAR(100) NOT NULL,
        attack_id         VARCHAR(50),
        llm_provider      VARCHAR(50),
        prompt            TEXT        NOT NULL,
        response          TEXT        NOT NULL,
        expected_behavior VARCHAR(50),
        actual_behavior   VARCHAR(50),
        success           BOOLEAN,
        execution_time_ms INTEGER,
        token_count       INTEGER,
        defense_ids       TEXT[],
        defense_state     JSONB,
        created_at        TIMESTAMP   DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_test_results_run      ON test_results(test_run_id);
      CREATE INDEX IF NOT EXISTS idx_test_results_provider ON test_results(llm_provider);
      CREATE INDEX IF NOT EXISTS idx_test_results_attack   ON test_results(test_case_id);
      CREATE INDEX IF NOT EXISTS idx_test_results_attack_id ON test_results(attack_id);
      CREATE INDEX IF NOT EXISTS idx_test_results_success  ON test_results(success);
    `,
  },

  // ── 006: Metrics ───────────────────────────────────────────────────────────
  // Includes min_execution_time_ms and max_execution_time_ms which are read
  // by DatabaseService.mapMetrics() in database.service.ts.
  {
    name: '006_metrics',
    sql: `
      CREATE TABLE IF NOT EXISTS metrics (
        id                     SERIAL       PRIMARY KEY,
        test_run_id            INTEGER      REFERENCES test_runs(id) ON DELETE CASCADE,
        attack_type            VARCHAR(50),
        defense_id             VARCHAR(50),
        llm_provider           VARCHAR(50),
        total_tests            INTEGER,
        passed_tests           INTEGER,
        failed_tests           INTEGER,
        true_positives         INTEGER,
        false_positives        INTEGER,
        true_negatives         INTEGER,
        false_negatives        INTEGER,
        accuracy               DECIMAL(10,4),
        precision              DECIMAL(10,4),
        recall                 DECIMAL(10,4),
        f1_score               DECIMAL(10,4),
        tpr                    DECIMAL(10,4),
        fpr                    DECIMAL(10,4),
        avg_execution_time_ms  DECIMAL(10,2),
        min_execution_time_ms  DECIMAL(10,2),
        max_execution_time_ms  DECIMAL(10,2),
        avg_token_count        DECIMAL(10,2),
        attack_success_rate    DECIMAL(10,4),
        defense_effectiveness  DECIMAL(10,4),
        calculated_at          TIMESTAMP    DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_metrics_run      ON metrics(test_run_id);
      CREATE INDEX IF NOT EXISTS idx_metrics_attack   ON metrics(attack_type);
      CREATE INDEX IF NOT EXISTS idx_metrics_defense  ON metrics(defense_id);
      CREATE INDEX IF NOT EXISTS idx_metrics_provider ON metrics(llm_provider);
    `,
  },

  // ── 007: Behavioral patterns ───────────────────────────────────────────────
  {
    name: '007_behavioral_patterns',
    sql: `
      CREATE TABLE IF NOT EXISTS behavioral_patterns (
        id               SERIAL       PRIMARY KEY,
        session_id       VARCHAR(100),
        response_type    VARCHAR(50),
        response_length  INTEGER,
        token_count      INTEGER,
        response_time_ms INTEGER,
        anomaly_score    DECIMAL(5,4),
        created_at       TIMESTAMP    DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_behavioral_session ON behavioral_patterns(session_id);
    `,
  },

  // ── 008: Attacks (persistent attack library) ───────────────────────────────
  {
    name: '008_attacks',
    sql: `
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

      CREATE INDEX IF NOT EXISTS idx_attacks_category ON attacks(category);
      CREATE INDEX IF NOT EXISTS idx_attacks_tier     ON attacks(tier);
      CREATE INDEX IF NOT EXISTS idx_attacks_builtin  ON attacks(is_built_in);
    `,
  },

  // ── 009: Security/auth uplift ──────────────────────────────────────────────
  {
    name: '009_security_auth_uplift',
    sql: `
      ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

      CREATE TABLE IF NOT EXISTS auth_sessions (
        id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id            UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id         UUID        NOT NULL UNIQUE,
        refresh_token_hash TEXT        NOT NULL UNIQUE,
        ip_address         INET,
        user_agent         TEXT,
        issued_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at         TIMESTAMPTZ NOT NULL,
        rotated_at         TIMESTAMPTZ,
        revoked_at         TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS login_events (
        id              BIGSERIAL   PRIMARY KEY,
        user_id         UUID        REFERENCES users(id) ON DELETE SET NULL,
        email_attempted TEXT,
        success         BOOLEAN     NOT NULL,
        ip_address      INET,
        user_agent      TEXT,
        failure_reason  TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id            BIGSERIAL   PRIMARY KEY,
        actor_user_id UUID        REFERENCES users(id) ON DELETE SET NULL,
        action        TEXT        NOT NULL,
        entity_type   TEXT,
        entity_id     TEXT,
        outcome       TEXT,
        ip_address    INET,
        user_agent    TEXT,
        metadata      JSONB,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_auth_sessions_user          ON auth_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires       ON auth_sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_active        ON auth_sessions(user_id, expires_at) WHERE revoked_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_login_events_user_created   ON login_events(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_login_events_success        ON login_events(success, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_log_actor_created     ON audit_log(actor_user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_log_action_created    ON audit_log(action, created_at DESC);
    `,
  },

  // ── 010: Phase 2 — defenses table, super_admin role, old-data cleanup ──────
  {
    name: '010_phase2_sync',
    sql: `
      -- Defenses table
      CREATE TABLE IF NOT EXISTS defenses (
        id               TEXT PRIMARY KEY,
        name             TEXT NOT NULL,
        description      TEXT NOT NULL,
        type             TEXT NOT NULL CHECK (type IN ('input', 'output', 'session')),
        enabled          BOOLEAN NOT NULL DEFAULT TRUE,
        is_built_in      BOOLEAN NOT NULL DEFAULT TRUE,
        counters_attacks TEXT[],
        how_it_works     TEXT,
        research_basis   TEXT,
        effectiveness    TEXT,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Allow super_admin role
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
      ALTER TABLE users ADD CONSTRAINT users_role_check
        CHECK (role IN ('super_admin', 'admin', 'user'));

      -- Update attacks category constraint for new attacks only
      ALTER TABLE attacks DROP CONSTRAINT IF EXISTS attacks_category_check;
      ALTER TABLE attacks ADD CONSTRAINT attacks_category_check
        CHECK (category IN ('override','leak','refuse','jailbreak','obfuscation','indirect','escalation'));

      -- Delete old attack records that are not in the current 5-attack set
      DELETE FROM attacks WHERE id NOT IN (
        'encoding-base64', 'payload-splitting', 'context-overflow',
        'indirect-injection', 'multi-turn-escalation', 'semantic-backdoor'
      );
    `,
  },

  // ── 011: Async jobs (stress tests & other long-running DB-backed work) ─────
  {
    name: '011_async_jobs',
    sql: `
      CREATE TABLE IF NOT EXISTS async_jobs (
        id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        job_type            VARCHAR(64) NOT NULL,
        status              VARCHAR(32) NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'running', 'completed', 'cancelled', 'failed')),
        cancel_requested    BOOLEAN     NOT NULL DEFAULT FALSE,
        input_payload       JSONB       NOT NULL DEFAULT '{}',
        progress            JSONB       NOT NULL DEFAULT '{}',
        result_summary      JSONB,
        error_message       TEXT,
        linked_test_run_id  INTEGER     REFERENCES test_runs(id) ON DELETE SET NULL,
        label               TEXT,
        metadata            JSONB       NOT NULL DEFAULT '{}',
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_async_jobs_status   ON async_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_async_jobs_created  ON async_jobs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_async_jobs_type     ON async_jobs(job_type);
      CREATE INDEX IF NOT EXISTS idx_async_jobs_test_run ON async_jobs(linked_test_run_id);
    `,
  },

  // ── 012: Stress-test schema sync ────────────────────────────────────────────
  {
    name: '012_stress_test_schema_sync',
    sql: `
      ALTER TABLE test_results
        ADD COLUMN IF NOT EXISTS attack_id VARCHAR(50);

      CREATE INDEX IF NOT EXISTS idx_test_results_attack_id ON test_results(attack_id);
    `,
  },

  // ── 013: Better Auth ────────────────────────────────────────────────────────
  {
    name: '013_better_auth',
    sql: `
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS image TEXT;

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
    `,
  },
  // ── 014: Migrate existing passwords to Better Auth account table ─────────────
  {
    name: '014_migrate_passwords',
    sql: `
      INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
      SELECT 
        gen_random_uuid()::text,
        id::text,
        'credential',
        id,
        password_hash,
        NOW(),
        NOW()
      FROM users
      WHERE password_hash IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM account 
          WHERE account."userId" = users.id 
            AND account."providerId" = 'credential'
        );
    `,
  },

  // ── 015: Drop legacy auth tables (replaced by Better Auth session/account) ──
  {
    name: '015_drop_legacy_auth_tables',
    sql: `
      DROP TABLE IF EXISTS auth_sessions;
      DROP TABLE IF EXISTS refresh_tokens;
    `,
  },

  // ── 016: Benign baseline is a stress-test option, not a library row ─────────
  {
    name: '016_remove_benign_baseline_from_attacks',
    sql: `
      DELETE FROM attacks WHERE id = 'benign-baseline';
    `,
  },
];

export async function runMigrations(): Promise<void> {
  // Ensure the tracking table exists (this single statement is always safe to re-run)
  await query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Fetch already-applied migration names
  const applied = await query('SELECT name FROM _migrations');
  const appliedSet = new Set(applied.rows.map((r: any) => r.name));

  const pending = migrations.filter(m => !appliedSet.has(m.name));

  if (pending.length === 0) {
    console.log('✓ All migrations already applied');
    return;
  }

  console.log(`Running ${pending.length} pending migration(s)...`);
  for (const m of pending) {
    await query(m.sql);
    await query('INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [m.name]);
    console.log(`  ✓ ${m.name}`);
  }
  console.log('✓ All migrations complete');
}
// ── Seed data ──────────────────────────────────────────────────────────────────

const SEED_ACCOUNTS = [
  { email: 'superadmin@lab.com', password: 'superadmin1234', role: 'super_admin' },
  { email: 'admin@lab.com', password: 'admin1234', role: 'admin' },
  { email: 'user@lab.com',  password: 'user1234',  role: 'user'  },
] as const;

// ── Helper: check if a seed step has already been applied ───────────────────
async function isSeedApplied(seedName: string): Promise<boolean> {
  const result = await query('SELECT 1 FROM _migrations WHERE name = $1', [seedName]);
  return result.rows.length > 0;
}

async function markSeedApplied(seedName: string): Promise<void> {
  await query('INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [seedName]);
}

export async function seedAttacks(): Promise<void> {
  const seedName = 'seed_attacks';
  if (await isSeedApplied(seedName)) {
    console.log('✓ Attack library already seeded');
    return;
  }
  console.log('Seeding attack library...');
  for (const attack of SEED_ATTACKS) {
    await query(
      `INSERT INTO attacks (id, name, description, injection_text, category, tier, how_it_works, mechanism, impact, example, is_built_in)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         injection_text = EXCLUDED.injection_text,
         category = EXCLUDED.category,
         tier = EXCLUDED.tier,
         how_it_works = EXCLUDED.how_it_works,
         mechanism = EXCLUDED.mechanism,
         impact = EXCLUDED.impact,
         example = EXCLUDED.example`,
      [
        attack.id,
        attack.name,
        attack.description,
        attack.injectionText,
        attack.category,
        attack.tier,
        attack.howItWorks || null,
        attack.mechanism || null,
        attack.impact || null,
        attack.example || null,
      ],
    );
  }
  await markSeedApplied(seedName);
  console.log(`  ✓ ${SEED_ATTACKS.length} attacks seeded`);
}

export async function seedDefenses(): Promise<void> {
  const seedName = 'seed_defenses';
  if (await isSeedApplied(seedName)) {
    console.log('✓ Defense library already seeded');
    return;
  }
  console.log('Seeding defense library...');
  for (const defense of SEED_DEFENSES) {
    await query(
      `INSERT INTO defenses (id, name, description, type, enabled, is_built_in, counters_attacks, how_it_works, research_basis, effectiveness)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         type = EXCLUDED.type,
         enabled = EXCLUDED.enabled,
         counters_attacks = EXCLUDED.counters_attacks,
         how_it_works = EXCLUDED.how_it_works,
         research_basis = EXCLUDED.research_basis,
         effectiveness = EXCLUDED.effectiveness`,
      [
        defense.id,
        defense.name,
        defense.description,
        defense.type,
        defense.enabled,
        defense.countersAttacks || [],
        defense.howItWorks || null,
        defense.researchBasis || null,
        defense.effectiveness || null,
      ],
    );
  }
  await markSeedApplied(seedName);
  console.log(`  ✓ ${SEED_DEFENSES.length} defenses seeded`);
}

export async function seedDefaultAccounts(): Promise<void> {
  const seedName = 'seed_default_accounts';
  if (await isSeedApplied(seedName)) {
    console.log('✓ Default accounts already seeded');
    return;
  }
  console.log('Seeding default accounts...');
  for (const account of SEED_ACCOUNTS) {
    const existing = await query(
      'SELECT id FROM users WHERE email = $1',
      [account.email],
    );
    if (existing.rows.length > 0) {
      console.log(`  – ${account.email} already exists, skipping`);
      continue;
    }
    const hash = await bcrypt.hash(account.password, 12);
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [account.email, hash, account.role],
    );
    const user = rows[0];
    if (user) {
      await query(
        `INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, 'credential', $2, $3, NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        [user.id, user.id, hash],
      );
    }
    console.log(`  ✓ ${account.email} (${account.role})`);
  }
  await markSeedApplied(seedName);
  console.log('✓ Seed accounts ready');
}

/**
 * Ensures every active user with a real bcrypt `password_hash` has a Better Auth
 * `credential` row. Without it, sign-in returns INVALID_EMAIL_OR_PASSWORD even when
 * the email exists (common if users were created before migration 014 or seed skipped
 * after a partial insert).
 */
export async function backfillCredentialAccounts(): Promise<void> {
  const result = await query(
    `INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
     SELECT gen_random_uuid()::text,
            u.id::text,
            'credential',
            u.id,
            u.password_hash,
            NOW(),
            NOW()
     FROM users u
     WHERE u.deleted_at IS NULL
       AND u.password_hash IS NOT NULL
       AND u.password_hash <> 'managed_by_better_auth'
       AND length(trim(u.password_hash)) >= 50
       AND NOT EXISTS (
         SELECT 1 FROM account a
         WHERE a."userId" = u.id AND a."providerId" = 'credential'
       )`,
  );
  const n = result.rowCount ?? 0;
  if (n > 0) {
    console.log(`✓ Backfilled ${n} missing credential account row(s) (Better Auth sign-in)`);
  }
}

export async function cleanupExpiredDeletedAccounts(): Promise<void> {
  const result = await query(
    `DELETE FROM users
     WHERE is_active = FALSE
       AND deleted_at IS NOT NULL
       AND deleted_at < NOW() - INTERVAL '72 hours'`,
  );
  const purged = result.rowCount ?? 0;
  if (purged > 0) {
    console.log(`✓ Purged ${purged} expired soft-deleted account(s)`);
  } else {
    console.log('✓ No expired deleted accounts to purge');
  }
}

// Allow direct execution: npx tsx src/db/migrate.ts
const isMain =
  process.argv[1]?.replace(/\\/g, '/').endsWith('src/db/migrate.ts') ||
  process.argv[1]?.replace(/\\/g, '/').endsWith('src/db/migrate');

if (isMain) {
  runMigrations()
    .then(() => seedDefaultAccounts())
    .then(() => backfillCredentialAccounts())
    .then(() => seedAttacks())
    .then(() => seedDefenses())
    .then(() => cleanupExpiredDeletedAccounts())
    .then(() => deleteExpiredSessions())
    .then(async () => {
      // InfoBank fixture manifest — logged on startup for operator reference.
      // Documents are not auto-seeded into the DB; upload them manually via the Documents page.
      // Manifest lives at shared/infobank-manifest.ts.
      const { INFOBANK_MANIFEST } = await import('../../../shared/infobank-manifest.js');
      const cleanCount = INFOBANK_MANIFEST.filter(d => d.folder === 'clean').length;
      const poisonedCount = INFOBANK_MANIFEST.filter(d => d.folder === 'poisoned').length;
      console.log(`📁 InfoBank: ${cleanCount} clean fixtures, ${poisonedCount} poisoned fixtures registered in manifest.`);
      console.log(`   Upload from InfoBank/ folder via the Documents page to begin testing.`);
    })
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
