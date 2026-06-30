import { query } from '../config/database';
import { Attack } from '../../../shared/types';
import { SEED_ATTACKS, createPoisonedDocument } from '../../../shared/attacks';

// ── Row → Attack mapper ──────────────────────────────────────────────────────

function mapRow(row: any): Attack {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    injectionText: row.injection_text,
    category: row.category,
    tier: row.tier,
    howItWorks: row.how_it_works ?? undefined,
    mechanism: row.mechanism ?? undefined,
    impact: row.impact ?? undefined,
    example: row.example ?? undefined,
    isBuiltIn: row.is_built_in,
  };
}

// ── Service ──────────────────────────────────────────────────────────────────

class AttackService {
  /**
   * Returns all attacks from the database.
   * Falls back to SEED_ATTACKS if the DB is unavailable.
   */
  async getAllAttacks(): Promise<Attack[]> {
    try {
      const result = await query(
        'SELECT * FROM attacks ORDER BY tier, category, name',
      );
      if (result.rows.length > 0) {
        return result.rows.map(mapRow);
      }
    } catch {
      // DB not available — fall through to seed data
    }
    // Fallback: return seed data with isBuiltIn flag
    return SEED_ATTACKS.map(a => ({ ...a, isBuiltIn: true }));
  }

  /**
   * Returns a single attack by ID.
   * Falls back to SEED_ATTACKS lookup if DB is unavailable.
   */
  async getAttackById(id: string): Promise<Attack | null> {
    try {
      const result = await query('SELECT * FROM attacks WHERE id = $1', [id]);
      if (result.rows.length > 0) {
        return mapRow(result.rows[0]);
      }
      return null;
    } catch {
      // Fallback to seed data
      const seed = SEED_ATTACKS.find(a => a.id === id);
      return seed ? { ...seed, isBuiltIn: true } : null;
    }
  }

  /**
   * Creates a new custom attack (admin only).
   * Returns the created attack.
   */
  async createAttack(data: {
    id: string;
    name: string;
    description: string;
    injectionText: string;
    category: Attack['category'];
    tier: Attack['tier'];
    howItWorks?: string;
    mechanism?: string;
    impact?: string;
    example?: string;
    createdBy?: string;
  }): Promise<Attack> {
    const result = await query(
      `INSERT INTO attacks (id, name, description, injection_text, category, tier, how_it_works, mechanism, impact, example, is_built_in, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, FALSE, $11)
       RETURNING *`,
      [
        data.id,
        data.name,
        data.description,
        data.injectionText,
        data.category,
        data.tier,
        data.howItWorks || null,
        data.mechanism || null,
        data.impact || null,
        data.example || null,
        data.createdBy || null,
      ],
    );
    return mapRow(result.rows[0]);
  }

  /**
   * Deletes a custom (non-built-in) attack.
   * Returns true if deleted, false if not found or is built-in.
   */
  async deleteAttack(id: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM attacks WHERE id = $1 AND is_built_in = FALSE RETURNING id',
      [id],
    );
    return result.rows.length > 0;
  }

  /** Re-export for convenience */
  createPoisonedDocument = createPoisonedDocument;
}

export const attackService = new AttackService();
