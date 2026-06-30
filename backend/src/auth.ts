/**
 * auth.ts — all auth in one place
 *
 * Sections:
 *   1. Types
 *   2. DB helpers      (users table queries)
 *   3. Middleware      (authenticateToken, requireAdmin, requireSuperAdmin)
 *   4. Router          (POST /register, GET /users, DELETE /users/:id,
 *                       POST /reset-password)
 */

import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { query, getClient } from './config/database';
import { User, JWTPayload, UserRole } from '../../shared/types';
import { auth } from './lib/better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { writeAuditLog } from './lib/audit';

// ─── 1. Types ─────────────────────────────────────────────────────────────────

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}

// ─── 2. DB helpers ────────────────────────────────────────────────────────────

const SALT_ROUNDS = 12;

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

function validatePassword(password: string): string | null {
  if (!PASSWORD_REGEX.test(password)) {
    return 'Password must be at least 8 characters and include uppercase, lowercase, and a number.';
  }
  return null;
}

function parseUserRole(role: unknown): UserRole {
  if (role === 'super_admin' || role === 'admin' || role === 'user') return role;
  return 'user';
}

async function findById(id: string): Promise<User | null> {
  const r = await query(
    'SELECT id, email, role, created_at FROM users WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  return r.rows[0] ?? null;
}

async function createUser(email: string, password: string, role: UserRole = 'user'): Promise<User> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const { rows: [user] } = await client.query(
      `INSERT INTO users (email, password_hash, role, display_name)
       VALUES ($1, $2, $3, $4) RETURNING id, email, role, created_at`,
      [email, hash, role, email.split('@')[0]],
    );
    await client.query(
      `INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, 'credential', $2, $3, NOW(), NOW())`,
      [user.id, user.id, hash],
    );
    await client.query('COMMIT');
    return user;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function listUsers(): Promise<User[]> {
  const r = await query(
    'SELECT id, email, role, created_at FROM users WHERE deleted_at IS NULL ORDER BY created_at ASC'
  );
  return r.rows;
}

async function removeUser(id: string): Promise<boolean> {
  const r = await query(
    'UPDATE users SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
    [id]
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── 3. Middleware ────────────────────────────────────────────────────────────

/** Verifies session via Better Auth; sets req.user on success. */
export async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers)
    });

    if (!session) { res.status(401).json({ error: 'Authentication required' }); return; }

    req.user = {
      userId: session.user.id,
      email: session.user.email,
      role: parseUserRole(session.user.role),
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Must follow authenticateToken. Rejects non-admin users with 403. */
export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user)             { res.status(401).json({ error: 'Authentication required' }); return; }
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    res.status(403).json({ error: 'Admin access required' }); return;
  }
  next();
}

/** Must follow authenticateToken. Rejects non-super_admin users with 403. */
export function requireSuperAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user)             { res.status(401).json({ error: 'Authentication required' }); return; }
  if (req.user.role !== 'super_admin') {
    res.status(403).json({ error: 'Super Admin access required' }); return;
  }
  next();
}

// ─── 4. Router ────────────────────────────────────────────────────────────────

const router = Router();

// POST /api/auth/register
// Public only when no users exist (seeds the first admin).
// After that, requires a valid admin Bearer token.
router.post('/register', async (req: AuthenticatedRequest, res: Response) => {
  const client = await getClient();
  let released = false;
  try {
    await client.query('BEGIN');
    // Advisory lock serialises concurrent first-user bootstraps
    await client.query('SELECT pg_advisory_xact_lock(1)');

    const countResult = await client.query(
      'SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL'
    );
    const isFirst = parseInt(countResult.rows[0].count, 10) === 0;

    let callerRole: UserRole | null = null;

    if (!isFirst) {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
      if (!session) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(401).json({ error: 'Authentication required' });
      }
      callerRole = parseUserRole(session.user.role);
      if (callerRole !== 'admin' && callerRole !== 'super_admin') {
        await client.query('ROLLBACK');
        client.release();
        return res.status(403).json({ error: 'Admin access required' });
      }
    }

    const { email, password, role } = req.body;
    if (!email || !password) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const pwError = validatePassword(password);
    if (pwError) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({ error: pwError });
    }

    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Role assignment hierarchy:
    // - First user ever → admin (bootstrap)
    // - Super Admin can create admin or user
    // - Admin can only create user
    let assignedRole: UserRole;
    if (isFirst) {
      assignedRole = 'admin';
    } else if (callerRole === 'super_admin') {
      assignedRole = (role === 'admin' || role === 'user') ? role : 'user';
    } else {
      if (role && role !== 'user') {
        await client.query('ROLLBACK');
        client.release();
        return res.status(403).json({ error: 'Admins can only create users with the "user" role' });
      }
      assignedRole = 'user';
    }

    await client.query('COMMIT');
    // Release the advisory lock, then do the actual user creation in a separate transaction
    client.release();
    released = true;

    const newUser = await createUser(email.toLowerCase().trim(), password, assignedRole);

    // Audit log for user creation
    const session = isFirst ? null : await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    await writeAuditLog({
      actorUserId: session?.user?.id ?? undefined,
      action: 'auth.create_user',
      entityType: 'user',
      entityId: newUser.id,
      outcome: 'success',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { email: newUser.email, role: assignedRole },
    }).catch(err => console.error('Audit log error (create_user):', err));

    return res.status(201).json({
      user: newUser,
      message: isFirst ? 'Admin account created. You can now log in.' : 'User created.',
    });
  } catch (err) {
    if (!released) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Registration failed' });
  }
});



// GET /api/auth/users  (admin only)
router.get('/users', authenticateToken, requireAdmin, async (_req, res: Response) => {
  try {
    return res.json({ users: await listUsers() });
  } catch (err) {
    console.error('List users error:', err);
    return res.status(500).json({ error: 'Failed to list users' });
  }
});

// DELETE /api/auth/users/:id  (admin+ with role hierarchy)
router.delete('/users/:id', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.params.id === req.user!.userId)
      return res.status(400).json({ error: 'You cannot delete your own account' });

    const target = await findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const callerRole = req.user!.role;

    if (target.role === 'super_admin') {
      return res.status(403).json({ error: 'Super admin accounts cannot be deleted' });
    }

    if (callerRole === 'admin' && target.role !== 'user') {
      return res.status(403).json({ error: 'Admins can only delete users with the "user" role' });
    }

    if (!(await removeUser(req.params.id)))
      return res.status(404).json({ error: 'User not found' });

    // Revoke all active Better Auth sessions for the deleted user
    await query(`DELETE FROM session WHERE "userId" = $1`, [req.params.id]);

    await writeAuditLog({
      actorUserId: req.user!.userId,
      action: 'auth.delete_user',
      entityType: 'user',
      entityId: req.params.id,
      outcome: 'success',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { targetEmail: target.email, targetRole: target.role },
    }).catch(err => console.error('Audit log error (delete_user):', err));

    return res.json({ success: true });
  } catch (err) {
    console.error('Delete user error:', err);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
});



// POST /api/auth/reset-password (admin+ with role hierarchy)
router.post('/reset-password', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword) {
      return res.status(400).json({ error: 'userId and newPassword are required' });
    }

    const pwError = validatePassword(newPassword);
    if (pwError) {
      return res.status(400).json({ error: pwError });
    }

    const target = await findById(userId);
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }

    const callerRole = req.user!.role;

    if (callerRole === 'admin' && target.role !== 'user') {
      return res.status(403).json({ error: 'Admins can only reset passwords for users with the "user" role' });
    }

    if (callerRole === 'super_admin' && target.role === 'super_admin' && target.id !== req.user!.userId) {
      return res.status(403).json({ error: 'Cannot reset password for other super admin accounts' });
    }

    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update both the legacy column and the canonical Better Auth account row
    await query(
      'UPDATE users SET password_hash = $1, password_changed_at = NOW(), updated_at = NOW() WHERE id = $2',
      [hash, userId],
    );
    await query(
      `UPDATE account SET password = $1, "updatedAt" = NOW()
       WHERE "userId" = $2 AND "providerId" = 'credential'`,
      [hash, userId],
    );

    try {
      await query(`DELETE FROM session WHERE "userId" = $1`, [userId]);
    } catch (revokeError) {
      console.error('Password reset revoke-session error:', revokeError);
      await writeAuditLog({
        actorUserId: req.user!.userId,
        action: 'auth.reset_password',
        entityType: 'user',
        entityId: userId,
        outcome: 'partial_failure',
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        metadata: {
          targetEmail: target.email,
          reason: 'session_revocation_failed',
        },
      });
      return res.status(502).json({
        error: 'Password updated, but session revocation failed. Please retry.',
      });
    }

    await writeAuditLog({
      actorUserId: req.user!.userId,
      action: 'auth.reset_password',
      entityType: 'user',
      entityId: userId,
      outcome: 'success',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { targetEmail: target.email },
    });
    return res.json({ success: true, message: `Password reset for ${target.email}` });
  } catch (err) {
    console.error('Password reset error:', err);
    return res.status(500).json({ error: 'Password reset failed' });
  }
});

export default router;
