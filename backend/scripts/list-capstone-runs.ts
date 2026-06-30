import { query, pool } from '../src/config/database';

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

async function main() {
  const runs = await query(`
    SELECT id, name, configuration, total_tests, passed_tests, failed_tests, started_at
    FROM test_runs
    WHERE configuration IS NOT NULL
    ORDER BY started_at DESC
  `);

  for (const run of runs.rows) {
    const cfg = run.configuration ?? {};
    const attackIds: string[] = cfg.attackIds ?? [];
    const defenseIds: string[] = cfg.defenseIds ?? [];
    const iterations = cfg.iterations ?? 0;
    const full = defenseIds.length === FULL_PIPELINE.length &&
      FULL_PIPELINE.every(d => defenseIds.includes(d));
    const undefended = defenseIds.length === 0;
    if (!undefended && !full) continue;
    if (iterations < 10) continue;

    const results = await query(`
      SELECT
        COALESCE(attack_id, test_case_id) AS raw_attack_id,
        COUNT(*)::int AS n,
        SUM(CASE WHEN success = false THEN 1 ELSE 0 END)::int AS breaches
      FROM test_results
      WHERE test_run_id = $1
      GROUP BY 1
    `, [run.id]);

    const perAttack = results.rows.map(r => ({
      attackId: normalizeAttackId(r.raw_attack_id),
      n: r.n,
      breaches: r.breaches,
      asr: Number((100 * r.breaches / r.n).toFixed(1)),
    }));

    console.log(JSON.stringify({
      runId: run.id,
      mode: undefended ? 'undefended' : 'full-pipeline',
      iterations,
      attackIds,
      total: run.total_tests,
      passed: run.passed_tests,
      failed: run.failed_tests,
      startedAt: run.started_at,
      perAttack,
    }));
  }

  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
