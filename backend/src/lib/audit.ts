import { query } from '../config/database';

export async function writeAuditLog(params: {
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

export async function recordLoginEvent(params: {
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
