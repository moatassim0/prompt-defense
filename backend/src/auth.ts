/**
 * auth.ts — all auth in one place
 *
 * Sections:
 *   1. Types
 *   2. Crypto helpers  (bcrypt + JWT)
 *   3. DB helpers      (users table queries)
 *   4. Middleware      (authenticateToken, requireAdmin)
 *   5. Router          (POST /login, POST /register, GET /me, GET /users, DELETE /users/:id)
 */

import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from './config/database';
import { User, JWTPayload, UserRole } from '../../shared/types';
import { auth } from './lib/better-auth';
import { fromNodeHeaders } from 'better-auth/node';

// ─── 1. Types ─────────────────────────────────────────────────────────────────

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}

interface UserRow extends User {
  password_hash: string;
}

// ─── 2. Crypto helpers ────────────────────────────────────────────────────────

const SALT_ROUNDS = 12;
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;



// ─── 3. DB helpers ────────────────────────────────────────────────────────────

async function findByEmail(email: string): Promise<UserRow | null> {
  const r = await query(
    'SELECT id, email, password_hash, role, created_at, failed_login_count, locked_until FROM users WHERE email = $1 AND deleted_at IS NULL',
    [email]
  );
  return r.rows[0] ?? null;
}

async function findById(id: string): Promise<User | null> {
  const r = await query(
    'SELECT id, email, role, created_at FROM users WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  return r.rows[0] ?? null;
}

async function createUser(email: string, password: string, role: UserRole = 'user'): Promise<User> {
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const r = await query(
    'INSERT INTO users (email, password_hash, role, display_name) VALUES ($1, $2, $3, $4) RETURNING id, email, role, created_at',
    [email, hash, role, email.split('@')[0]]
  );
  const user = r.rows[0];
  
  // Sync the password to Better Auth's account table so the user can log in
  await query(
    `INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, 'credential', $2, $3, NOW(), NOW())`,
    [user.id, user.id, hash]
  );
  
  return user;
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

async function userCount(): Promise<number> {
  const r = await query('SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL');
  return parseInt(r.rows[0].count, 10);
}

async function recordLoginSuccess(userId: string): Promise<void> {
  await query(
    'UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW(), updated_at = NOW() WHERE id = $1',
    [userId],
  );
}

async function recordLoginFailure(userId: string): Promise<void> {
  await query(
    `
      UPDATE users
      SET failed_login_count = failed_login_count + 1,
          locked_until = CASE
            WHEN failed_login_count + 1 >= $2 THEN NOW() + ($3 || ' minutes')::INTERVAL
            ELSE locked_until
          END,
          updated_at = NOW()
      WHERE id = $1
    `,
    [userId, LOCKOUT_THRESHOLD, LOCKOUT_MINUTES],
  );
}

async function recordLoginEvent(params: {
  userId?: string;
  email: string;
  success: boolean;
  ipAddress?: string;
  userAgent?: string;
  failureReason?: string;
}): Promise<void> {
  await query(
    `INSERT INTO login_events (user_id, email_attempted, success, ip_address, user_agent, failure_reason)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      params.userId ?? null,
      params.email,
      params.success,
      params.ipAddress ?? null,
      params.userAgent ?? null,
      params.failureReason ?? null,
    ],
  );
}

async function writeAuditLog(params: {
  actorUserId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  outcome?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, outcome, ip_address, user_agent, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      params.actorUserId ?? null,
      params.action,
      params.entityType ?? null,
      params.entityId ?? null,
      params.outcome ?? null,
      params.ipAddress ?? null,
      params.userAgent ?? null,
      params.metadata ? JSON.stringify(params.metadata) : null,
    ],
  );
}



// ─── 4. Middleware ────────────────────────────────────────────────────────────

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
      role: (session.user as any).role as "admin" | "user" | "super_admin"
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function getOptionalAuthPayload(req: Request): JWTPayload | undefined {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;

  if (!token) return undefined;

  try {
    return verifyToken(token);
  } catch {
    return undefined;
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

// ─── 5. Router ────────────────────────────────────────────────────────────────

const router = Router();

// POST /api/auth/register
// Public only when no users exist (seeds the first admin).
// After that, requires a valid admin Bearer token.
router.post('/register', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const isFirst = (await userCount()) === 0;
    let callerRole: UserRole | null = null;

    if (!isFirst) {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
      if (!session) return res.status(401).json({ error: 'Authentication required' });
      callerRole = (session.user as any).role;
      if (callerRole !== 'admin' && callerRole !== 'super_admin')
        return res.status(403).json({ error: 'Admin access required' });
    }

    const { email, password, role } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required' });
    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (await findByEmail(email.toLowerCase().trim()))
      return res.status(409).json({ error: 'Email already registered' });

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
      // Admin caller — can only create 'user'
      if (role && role !== 'user') {
        return res.status(403).json({ error: 'Admins can only create users with the "user" role' });
      }
      assignedRole = 'user';
    }
    const newUser = await createUser(email.toLowerCase().trim(), password, assignedRole);

    return res.status(201).json({
      user: newUser,
      message: isFirst ? 'Admin account created. You can now log in.' : 'User created.',
    });
  } catch (err) {
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

    // Fetch target user to check role
    const target = await findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const callerRole = req.user!.role;

    // Super_admin accounts cannot be deleted by anyone
    if (target.role === 'super_admin') {
      return res.status(403).json({ error: 'Super admin accounts cannot be deleted' });
    }

    // Admin can only delete role='user', not other admins
    if (callerRole === 'admin' && target.role !== 'user') {
      return res.status(403).json({ error: 'Admins can only delete users with the "user" role' });
    }

    // Super_admin can delete admin or user (super_admin already blocked above)
    if (!(await removeUser(req.params.id)))
      return res.status(404).json({ error: 'User not found' });
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
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const target = await findById(userId);
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }

    const callerRole = req.user!.role;

    // Admin can only reset password for role='user'
    if (callerRole === 'admin' && target.role !== 'user') {
      return res.status(403).json({ error: 'Admins can only reset passwords for users with the "user" role' });
    }

    // Super_admin can reset password for admin and user (not other super_admins, and not self via this route)
    if (callerRole === 'super_admin' && target.role === 'super_admin' && target.id !== req.user!.userId) {
      return res.status(403).json({ error: 'Cannot reset password for other super admin accounts' });
    }

    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await query(
      'UPDATE users SET password_hash = $1, password_changed_at = NOW(), updated_at = NOW() WHERE id = $2',
      [hash, userId],
    );
    await auth.api.revokeSessions({
      body: { userId }
    });
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
