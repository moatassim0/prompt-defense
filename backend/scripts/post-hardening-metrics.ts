import { query, pool } from '../src/config/database';

const ATTACKS = [
  'indirect-injection',
  'multi-turn-escalation',
  'semantic-backdoor',
  'context-overflow',
  'payload-splitting',
  'encoding-base64',
];

const FULL_PIPELINE = [
  'encoding-detector',
  'semantic-trigger-detector',
  'canary-word',
  'prompt-sandwiching',
  'llm-judge',
  'dlp-filter',
  'turn-tracker',
];

function normalizeAttackId(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/^([a-z0-9-]+?)(?:-iter-\d+)?$/);
  return m ? m[1] : raw;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

async function main() {
  const since = '2026-05-01';
  const rows = await query(`
    SELECT tres.*, tr.configuration, tr.started_at
    FROM test_results tres
    JOIN test_runs tr ON tr.id = tres.test_run_id
    WHERE tr.started_at >= $1
      AND COALESCE(tres.attack_id, tres.test_case_id) <> 'benign-baseline'
    ORDER BY tr.started_at DESC
  `, [since]);

  type Stat = { n: number; breaches: number };
  const undef = new Map<string, Stat>();
  const full = new Map<string, Stat>();
  const partial = new Map<string, Stat>();
  for (const id of ATTACKS) {
    undef.set(id, { n: 0, breaches: 0 });
    full.set(id, { n: 0, breaches: 0 });
    partial.set(id, { n: 0, breaches: 0 });
  }

  const defenseStats = new Map<string, { n: number; triggered: number }>();
  for (const d of FULL_PIPELINE) defenseStats.set(d, { n: 0, triggered: 0 });

  for (const row of rows.rows) {
    const attackId = normalizeAttackId(row.attack_id ?? row.test_case_id);
    if (!attackId || !undef.has(attackId)) continue;
    const defenseIds: string[] = row.defense_ids ?? [];
    const breached = row.success === false;
    const bucket = defenseIds.length === 0
      ? undef
      : arraysEqual(defenseIds, FULL_PIPELINE)
        ? full
        : partial;
    const s = bucket.get(attackId)!;
    s.n++;
    if (breached) s.breaches++;

    if (defenseIds.length > 0) {
      const verdicts = row.defense_state?.pipelineResult?.verdicts ?? [];
      for (const d of FULL_PIPELINE) {
        if (!defenseIds.includes(d)) continue;
        const st = defenseStats.get(d)!;
        st.n++;
        const triggered = Array.isArray(verdicts) && verdicts.some((v: any) =>
          v?.defenseId === d && (v?.action === 'block' || v?.action === 'flag' || v?.action === 'warn' || v?.triggered === true)
        );
        if (triggered) st.triggered++;
      }
    }
  }

  const fmt = (s: Stat) => ({ n: s.n, breaches: s.breaches, asr: s.n ? Number((100 * s.breaches / s.n).toFixed(1)) : null });

  console.log(JSON.stringify({
    since,
    totalRows: rows.rows.length,
    undefended: Object.fromEntries(ATTACKS.map(id => [id, fmt(undef.get(id)!)])),
    fullPipeline: Object.fromEntries(ATTACKS.map(id => [id, fmt(full.get(id)!)])),
    partialPipeline: Object.fromEntries(ATTACKS.map(id => [id, fmt(partial.get(id)!)])),
    defenseStats: Object.fromEntries([...defenseStats.entries()].map(([id, s]) => [id, {
      n: s.n,
      triggered: s.triggered,
      rate: s.n ? Number((100 * s.triggered / s.n).toFixed(1)) : null,
    }])),
  }, null, 2));

  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
