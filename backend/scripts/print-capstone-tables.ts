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

const DEFENSE_META: Record<string, { label: string; stage: string; target: string }> = {
  'encoding-detector': { label: 'Encoding Detector', stage: 'Input', target: 'Base64 Encoding' },
  'semantic-trigger-detector': { label: 'Semantic Trigger Detector', stage: 'Input', target: 'Indirect Injection, Semantic Backdoor' },
  'canary-word': { label: 'Canary Word Injection', stage: 'Input', target: 'Payload Splitting, Context Overflow' },
  'prompt-sandwiching': { label: 'Prompt Sandwiching', stage: 'Input', target: 'All categories' },
  'llm-judge': { label: 'LLM Judge', stage: 'Output', target: 'All categories' },
  'dlp-filter': { label: 'DLP Filter', stage: 'Output', target: 'Data exfiltration payloads' },
  'turn-tracker': { label: 'Session Turn Tracker', stage: 'Output', target: 'Fabricated Session History' },
};

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

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Number(((100 * n) / d).toFixed(1));
}

async function main() {
  const rows = await query(`
    SELECT tres.*, tr.started_at, tr.configuration
    FROM test_results tres
    JOIN test_runs tr ON tr.id = tres.test_run_id
    WHERE COALESCE(tres.attack_id, tres.test_case_id) IS NOT NULL
      AND COALESCE(tres.attack_id, tres.test_case_id) <> 'benign-baseline'
  `);

  type Bucket = { n: number; breaches: number };
  const undefended = new Map<string, Bucket>();
  const defendedFull = new Map<string, Bucket>();
  for (const a of ATTACKS) {
    undefended.set(a.id, { n: 0, breaches: 0 });
    defendedFull.set(a.id, { n: 0, breaches: 0 });
  }

  const defenseStats = new Map<string, { n: number; triggered: number }>();
  for (const d of FULL_PIPELINE) defenseStats.set(d, { n: 0, triggered: 0 });

  for (const row of rows.rows) {
    const attackId = normalizeAttackId(row.attack_id ?? row.test_case_id);
    if (!attackId || !undefended.has(attackId)) continue;

    const defenseIds: string[] = row.defense_ids ?? [];
    const breached = row.success === false;
    const isUndefended = defenseIds.length === 0;
    const isFull = arraysEqual(defenseIds, FULL_PIPELINE);

    if (isUndefended) {
      const b = undefended.get(attackId)!;
      b.n++;
      if (breached) b.breaches++;
    }
    if (isFull) {
      const b = defendedFull.get(attackId)!;
      b.n++;
      if (breached) b.breaches++;
    }

    if (isFull && defenseIds.length > 0) {
      const verdicts = row.defense_state?.pipelineResult?.verdicts ?? [];
      for (const d of FULL_PIPELINE) {
        const st = defenseStats.get(d)!;
        st.n++;
        const triggered = Array.isArray(verdicts) && verdicts.some((v: any) =>
          v?.defenseId === d &&
          (v?.action === 'block' || v?.action === 'flag' || v?.action === 'warn' || v?.triggered === true)
        );
        if (triggered) st.triggered++;
      }
    }
  }

  console.log('## 7.3 Attack Effectiveness (Undefended)\n');
  console.log('Table 7.1: Undefended Attack Success Rates\n');
  console.log('| Attack Category | Iterations | Successful Injections | ASR | Severity |');
  console.log('|---|---:|---:|---:|---|');
  for (const a of ATTACKS) {
    const b = undefended.get(a.id)!;
    console.log(`| ${a.label} | ${b.n} | ${b.breaches} | ${pct(b.breaches, b.n)}% | ${a.severity} |`);
  }

  console.log('\n## 7.4 Defense Pipeline Effectiveness\n');
  console.log('Table 7.2: Defended vs Undefended ASR Comparison\n');
  console.log('| Attack Category | Undefended ASR | Defended ASR | Reduction |');
  console.log('|---|---:|---:|---:|');
  for (const a of ATTACKS) {
    const u = undefended.get(a.id)!;
    const d = defendedFull.get(a.id)!;
    const uAsr = pct(u.breaches, u.n);
    const dAsr = pct(d.breaches, d.n);
    console.log(`| ${a.label} | ${uAsr}% | ${dAsr}% | ${Number((uAsr - dAsr).toFixed(1))}% |`);
  }

  console.log('\nTable 7.3 — Per-Defense Detection Rates (full seven-mechanism pipeline only)\n');
  console.log('| Defense Mechanism | Stage | Primary Attack Targeted | Iterations | Triggered | Detection Rate |');
  console.log('|---|---|---|---:|---:|---:|');
  for (const id of FULL_PIPELINE) {
    const s = defenseStats.get(id)!;
    const meta = DEFENSE_META[id];
    console.log(`| ${meta.label} | ${meta.stage} | ${meta.target} | ${s.n} | ${s.triggered} | ${pct(s.triggered, s.n)}% |`);
  }

  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
