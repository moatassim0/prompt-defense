import { query, pool } from '../src/config/database';

const ATTACKS = [
  { id: 'indirect-injection', label: 'Indirect Injection', severity: 'Advanced' },
  { id: 'multi-turn-escalation', label: 'Fabricated Session History', severity: 'Advanced' },
  { id: 'semantic-backdoor', label: 'Semantic Backdoor', severity: 'Advanced' },
  { id: 'context-overflow', label: 'Context Overflow', severity: 'Intermediate' },
  { id: 'payload-splitting', label: 'Payload Splitting', severity: 'Intermediate' },
  { id: 'encoding-base64', label: 'Base64 Encoding', severity: 'Intermediate' },
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
  if (!m) return raw;
  return m[1];
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

async function main() {
  const rows = await query(`
    SELECT
      tres.id,
      tres.test_run_id,
      COALESCE(tres.attack_id, tres.test_case_id) AS raw_attack_id,
      tres.success,
      tres.defense_ids,
      tres.defense_state,
      tr.configuration,
      tr.started_at
    FROM test_results tres
    JOIN test_runs tr ON tr.id = tres.test_run_id
    WHERE COALESCE(tres.attack_id, tres.test_case_id) IS NOT NULL
      AND COALESCE(tres.attack_id, tres.test_case_id) <> 'benign-baseline'
    ORDER BY tr.started_at DESC
  `);

  type Bucket = { iterations: number; breaches: number; runIds: Set<number> };
  const undefended = new Map<string, Bucket>();
  const defendedFull = new Map<string, Bucket>();
  const defendedAny = new Map<string, Bucket>();

  for (const attack of ATTACKS) {
    undefended.set(attack.id, { iterations: 0, breaches: 0, runIds: new Set() });
    defendedFull.set(attack.id, { iterations: 0, breaches: 0, runIds: new Set() });
    defendedAny.set(attack.id, { iterations: 0, breaches: 0, runIds: new Set() });
  }

  const defenseTriggers = new Map<string, { iterations: number; triggered: number }>();
  for (const d of FULL_PIPELINE) {
    defenseTriggers.set(d, { iterations: 0, triggered: 0 });
  }

  for (const row of rows.rows) {
    const attackId = normalizeAttackId(row.raw_attack_id);
    if (!attackId || !undefended.has(attackId)) continue;

    const defenseIds: string[] = Array.isArray(row.defense_ids) ? row.defense_ids : [];
    const breached = row.success === false;
    const isUndefended = defenseIds.length === 0;
    const isFullPipeline = arraysEqual(defenseIds, FULL_PIPELINE);

    if (isUndefended) {
      const b = undefended.get(attackId)!;
      b.iterations++;
      if (breached) b.breaches++;
      b.runIds.add(row.test_run_id);
    }

    if (defenseIds.length > 0) {
      const any = defendedAny.get(attackId)!;
      any.iterations++;
      if (breached) any.breaches++;
      any.runIds.add(row.test_run_id);
    }

    if (isFullPipeline) {
      const b = defendedFull.get(attackId)!;
      b.iterations++;
      if (breached) b.breaches++;
      b.runIds.add(row.test_run_id);
    }

    if (defenseIds.length > 0) {
      const verdicts = row.defense_state?.pipelineResult?.verdicts ?? [];
      for (const defenseId of FULL_PIPELINE) {
        if (!defenseIds.includes(defenseId)) continue;
        const stat = defenseTriggers.get(defenseId)!;
        stat.iterations++;
        const triggered = Array.isArray(verdicts) && verdicts.some((v: any) =>
          v?.defenseId === defenseId &&
          (v?.action === 'block' || v?.action === 'flag' || v?.action === 'warn' || v?.triggered === true)
        );
        if (triggered) stat.triggered++;
      }
    }
  }

  const table71 = ATTACKS.map(a => {
    const b = undefended.get(a.id)!;
    const asr = b.iterations ? (100 * b.breaches / b.iterations) : null;
    return {
      attack: a.label,
      severity: a.severity,
      iterations: b.iterations,
      successfulInjections: b.breaches,
      asrPct: asr == null ? null : Number(asr.toFixed(1)),
      sourceRuns: [...b.runIds],
    };
  });

  const table72 = ATTACKS.map(a => {
    const u = undefended.get(a.id)!;
    const d = defendedFull.get(a.id)!;
    const uAsr = u.iterations ? (100 * u.breaches / u.iterations) : null;
    const dAsr = d.iterations ? (100 * d.breaches / d.iterations) : null;
    const reduction = uAsr != null && dAsr != null ? uAsr - dAsr : null;
    return {
      attack: a.label,
      undefendedAsrPct: uAsr == null ? null : Number(uAsr.toFixed(1)),
      defendedAsrPct: dAsr == null ? null : Number(dAsr.toFixed(1)),
      reductionPct: reduction == null ? null : Number(reduction.toFixed(1)),
      defendedIterations: d.iterations,
      undefendedIterations: u.iterations,
      defendedAnyAsrPct: defendedAny.get(a.id)!.iterations
        ? Number((100 * defendedAny.get(a.id)!.breaches / defendedAny.get(a.id)!.iterations).toFixed(1))
        : null,
    };
  });

  const defenseLabels: Record<string, { label: string; stage: string; target: string }> = {
    'encoding-detector': { label: 'Encoding Detector', stage: 'Input', target: 'Base64 Encoding' },
    'semantic-trigger-detector': { label: 'Semantic Trigger Detector', stage: 'Input', target: 'Indirect Injection, Semantic Backdoor' },
    'canary-word': { label: 'Canary Word Injection', stage: 'Input', target: 'Payload Splitting, Context Overflow' },
    'prompt-sandwiching': { label: 'Prompt Sandwiching', stage: 'Input', target: 'All categories' },
    'llm-judge': { label: 'LLM Judge', stage: 'Output', target: 'All categories' },
    'dlp-filter': { label: 'DLP Filter', stage: 'Output', target: 'Data exfiltration payloads' },
    'turn-tracker': { label: 'Session Turn Tracker', stage: 'Output', target: 'Fabricated Session History' },
  };

  const table73 = FULL_PIPELINE.map(id => {
    const s = defenseTriggers.get(id)!;
    const rate = s.iterations ? (100 * s.triggered / s.iterations) : null;
    const meta = defenseLabels[id];
    return {
      mechanism: meta.label,
      stage: meta.stage,
      primaryTarget: meta.target,
      iterations: s.iterations,
      triggered: s.triggered,
      detectionRatePct: rate == null ? null : Number(rate.toFixed(1)),
    };
  });

  // Best dedicated runs: undefended 50-iter per attack
  const dedicatedRuns = await query(`
    SELECT id, name, configuration, total_tests, passed_tests, failed_tests, started_at
    FROM test_runs
    WHERE configuration IS NOT NULL
    ORDER BY started_at DESC
  `);

  const perAttackRuns = ATTACKS.map(a => {
    const matches = dedicatedRuns.rows.filter(r => {
      const cfg = r.configuration ?? {};
      const attackIds: string[] = cfg.attackIds ?? [];
      const defenseIds: string[] = cfg.defenseIds ?? [];
      return attackIds.length === 1 && attackIds[0] === a.id;
    });
    return {
      attack: a.label,
      undefended50: matches.filter(r => !(r.configuration?.defenseIds?.length)).slice(0, 3),
      defendedFull50: matches.filter(r => arraysEqual(r.configuration?.defenseIds ?? [], FULL_PIPELINE)).slice(0, 3),
    };
  });

  console.log(JSON.stringify({ table71, table72, table73, perAttackRuns }, null, 2));
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
