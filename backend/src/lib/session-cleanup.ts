import { query } from '../config/database';

/** Delete expired Better Auth sessions (housekeeping). */
export async function deleteExpiredSessions(): Promise<void> {
  await query(`DELETE FROM session WHERE "expiresAt" < NOW()`);
}

/**
 * Keep only the `keep` most recent sessions per user (by createdAt).
 * Runs after each successful sign-in so scripted clients (e.g. curl) cannot
 * accumulate unbounded session rows.
 */
export async function pruneUserSessionsKeepNewest(userId: string, keep: number): Promise<void> {
  if (keep < 1) return;
  await query(
    `WITH ranked AS (
       SELECT id,
              ROW_NUMBER() OVER (ORDER BY "createdAt" DESC NULLS LAST) AS rn
       FROM session
       WHERE "userId" = $1::uuid
     )
     DELETE FROM session s
     USING ranked r
     WHERE s.id = r.id AND r.rn > $2`,
    [userId, keep],
  );
}
