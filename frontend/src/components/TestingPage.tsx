import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  FlaskConical, Play, Loader2, CheckCircle2,
  ChevronDown, Square, Check, AlertTriangle, Shield, Zap, Lock,
  BarChart3, ListFilter, Sparkles, Download,
} from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { cn } from '@/lib/utils';
import { filterAdversarialAttacks } from '@/lib/attack-filters';
import type { DefenseEconomics, Document, SeverityLevel, StressSeverityMetric } from '../../../shared/types';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { PageHeader, PageHeaderStat } from './ui/page-header';
import { Switch } from './ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { notify } from '../lib/notify';
import { formatApiErrorForUser } from '../lib/describe-api-error';
import { downloadCsv, downloadJson } from '../lib/export-download';

const API_URL = '/api';
const SCORE_THRESHOLD_MIN = 0.05;
const SCORE_THRESHOLD_MAX = 0.95;

const FORCED_JUDGE_SESSION_TOOLTIP =
  'Judge forced active for this session — Qwen will run on all subsequent turns until the session resets, regardless of the LLM-as-Judge toggle state.';

interface AttackOption {
  id: string;
  name: string;
  category: string;
  tier: string;
}

interface DefenseOption {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
}

interface TestResultItem {
  id: string;
  name: string;
  attackType: string;
  attackName?: string;
  severity: SeverityLevel;
  severityMetric?: StressSeverityMetric;
  prompt: string;
  response: string;
  expectedBehavior: string;
  actualBehavior: string;
  success: boolean;
  evalReason?: string;
  executionTimeMs: number;
  defenses: string[];
  defenseEconomics?: DefenseEconomics;
  defenseState?: {
    evaluationSummary?: { scoreThresholdUsed?: number; finalScore?: number };
    activeDefenses?: string[];
    pipelineResult?: {
      verdicts?: { defenseId: string; defenseName: string; triggered: boolean; details: string }[];
      forcedJudgeActive?: boolean;
    };
  };
  pipelineConfidence?: number;
  pipelineConfidencePct?: number;
  evaluatorConfidencePct?: number;
  iteration?: number;
}

interface PerAttackSummary {
  total: number;
  passed: number;
  failed: number;
  avgLatency: number;
  avgAddedLatencyMs: number;
  avgTokenOverhead: number;
  avgJudgeCalls: number;
  totalEstimatedJudgeCostUsd: number;
}

interface TestingPageProps {
  /** Same library as Chat / Simulator — passed into stress test context when enabled. */
  documents?: Document[];
}

function getSeverityClass(severity: SeverityLevel): string {
  switch (severity) {
    case 'critical':
      return 'bg-destructive/10 text-destructive';
    case 'high':
      return 'bg-amber-500/10 text-amber-400';
    case 'medium':
      return 'bg-muted text-muted-foreground';
    case 'low':
    default:
      return 'bg-sky-500/10 text-sky-400';
  }
}

function formatSeverityKind(kind?: StressSeverityMetric['kind']): string | null {
  if (!kind) return null;
  return kind.replace(/_/g, ' ');
}

/** Only auto-follow new results while the scroll position is near the bottom (lets you scroll up to Stop / inspect). */
const STRESS_RESULTS_STICK_TO_BOTTOM_PX = 140;

function getVerticalScrollAncestor(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null;
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.documentElement && node !== document.body) {
    const { overflowY } = window.getComputedStyle(node);
    if (
      node.scrollHeight - node.clientHeight > 8
      && (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : document.documentElement;
}

function scrollDistanceFromBottom(scrollEl: HTMLElement): number {
  if (scrollEl === document.documentElement || scrollEl === document.body) {
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    const viewportBottom = scrollTop + window.innerHeight;
    const full = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    return Math.max(0, full - viewportBottom);
  }
  return Math.max(0, scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight);
}

function isStressResultsNearLiveBottom(sentinel: HTMLElement | null): boolean {
  if (!sentinel) return true;
  const ancestor = getVerticalScrollAncestor(sentinel);
  if (!ancestor) return true;
  return scrollDistanceFromBottom(ancestor) <= STRESS_RESULTS_STICK_TO_BOTTOM_PX;
}

function clampScoreThreshold(value: number): number {
  if (!Number.isFinite(value)) return SCORE_THRESHOLD_MIN;
  return Number(Math.min(SCORE_THRESHOLD_MAX, Math.max(SCORE_THRESHOLD_MIN, value)).toFixed(2));
}

function clipStressText(s: string, max = 3200): string {
  const t = s ?? '';
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function normalizePipelineConfidence(value?: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Number(Math.min(100, Math.max(0, value)).toFixed(1));
}

function normalizeEvaluatorConfidence(value?: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Number(Math.min(100, Math.max(0, value)).toFixed(1));
}

const stressSchema = z.object({
  attackIds: z.array(z.string()).min(1, 'Select at least one attack'),
  iterations: z.coerce.number().int().min(1).max(500),
  scoreThreshold: z.number().min(SCORE_THRESHOLD_MIN).max(SCORE_THRESHOLD_MAX).optional(),
});

type StressFormValues = z.infer<typeof stressSchema>;

export default function TestingPage({ documents = [] }: TestingPageProps) {
  const { user } = useAuth();

  if (user?.role !== 'admin' && user?.role !== 'super_admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <Lock size={48} className="text-muted-foreground mb-4" />
        <h2 className="text-foreground text-lg font-semibold mb-1">Admin Only</h2>
        <p className="text-muted-foreground text-sm">The Stress Test runner is restricted to administrators.</p>
      </div>
    );
  }

  return <TestingPageContent documents={documents} />;
}

function TestingPageContent({ documents }: { documents: Document[] }) {
  const [attacks, setAttacks] = useState<AttackOption[]>([]);
  const [defenses, setDefenses] = useState<DefenseOption[]>([]);
  const [selectedDefenses, setSelectedDefenses] = useState<string[]>([]);
  const [includeBaseline, setIncludeBaseline] = useState(false);
  const [useJudgeEvaluation, setUseJudgeEvaluation] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const [filter, setFilter] = useState<'all' | 'passed' | 'failed'>('all');
  const [expandedTest, setExpandedTest] = useState<string | null>(null);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState({ current: 0, total: 0, passed: 0, failed: 0 });
  const [results, setResults] = useState<TestResultItem[]>([]);
  const [done, setDone] = useState(false);
  const [testRunId, setTestRunId] = useState<number | null>(null);
  const [perAttackSummary, setPerAttackSummary] = useState<Record<string, PerAttackSummary>>({});
  const [scoreThresholdDraft, setScoreThresholdDraft] = useState('0.45');
  const [iterationsDraft, setIterationsDraft] = useState('50');
  const abortRef = useRef<AbortController | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const resultsEndRef = useRef<HTMLDivElement | null>(null);
  const prevRunningRef = useRef(false);
  const [resultsContainerRef] = useAutoAnimate();
  const [runCompleteFlash, setRunCompleteFlash] = useState(false);

  const stressForm = useForm<StressFormValues>({
    resolver: zodResolver(stressSchema),
    defaultValues: {
      attackIds: [],
      iterations: 50,
      scoreThreshold: 0.45,
    },
    mode: 'onTouched',
  });

  const attackIdsWatch = stressForm.watch('attackIds');
  const iterationsWatch = stressForm.watch('iterations');
  const scoreThresholdWatch = stressForm.watch('scoreThreshold');
  const { isSubmitting: isStressSubmitting } = stressForm.formState;

  useEffect(() => {
    Promise.all([
      axios.get(`${API_URL}/attacks`),
      axios.get(`${API_URL}/defenses`),
    ]).then(([atkRes, defRes]) => {
      setAttacks(filterAdversarialAttacks(atkRes.data as AttackOption[]));
      setDefenses(defRes.data);
      setSelectedDefenses(defRes.data.filter((d: DefenseOption) => d.enabled).map((d: DefenseOption) => d.id));
    }).catch((err: unknown) => setError(formatApiErrorForUser(err)));
  }, []);

  useEffect(() => {
    if (!running || !resultsEndRef.current) return;
    if (!isStressResultsNearLiveBottom(resultsEndRef.current)) return;
    resultsEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [results.length, running]);

  useEffect(() => {
    const n = scoreThresholdWatch ?? 0.45;
    setScoreThresholdDraft(n.toFixed(2));
  }, [scoreThresholdWatch]);

  useEffect(() => {
    setIterationsDraft(String(iterationsWatch ?? 50));
  }, [iterationsWatch]);

  useEffect(() => {
    const shouldFlash = prevRunningRef.current && !running && done;
    if (shouldFlash) {
      setRunCompleteFlash(true);
      const t = window.setTimeout(() => setRunCompleteFlash(false), 1500);
      prevRunningRef.current = running;
      return () => window.clearTimeout(t);
    }
    prevRunningRef.current = running;
  }, [running, done]);

  const toggleAttack = useCallback(
    (id: string) => {
      const cur = stressForm.getValues('attackIds');
      stressForm.setValue(
        'attackIds',
        cur.includes(id) ? cur.filter((a) => a !== id) : [...cur, id],
        { shouldValidate: true, shouldDirty: true },
      );
    },
    [stressForm],
  );

  const toggleDefense = useCallback((id: string) => {
    setSelectedDefenses((prev) => prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]);
  }, []);

  const selectAllAttacks = useCallback(() => {
    stressForm.setValue(
      'attackIds',
      attacks.map((a) => a.id),
      { shouldValidate: true, shouldDirty: true },
    );
  }, [attacks, stressForm]);

  const deselectAllAttacks = useCallback(() => {
    stressForm.setValue('attackIds', [], { shouldValidate: true, shouldDirty: true });
  }, [stressForm]);

  const selectAllDefenses = useCallback(() => {
    setSelectedDefenses(defenses.map((d) => d.id));
  }, [defenses]);

  const deselectAllDefenses = useCallback(() => {
    setSelectedDefenses([]);
  }, []);

  const commitIterationsDraft = useCallback(
    (fallback?: number) => {
      const parsed = parseInt(iterationsDraft, 10);
      const current = stressForm.getValues('iterations');
      const next = Number.isFinite(parsed)
        ? Math.min(500, Math.max(1, parsed))
        : typeof fallback === 'number' && fallback >= 1
          ? fallback
          : Number(current) >= 1
            ? Number(current)
            : 50;
      stressForm.setValue('iterations', next, { shouldValidate: true, shouldDirty: true });
      setIterationsDraft(String(next));
      return next;
    },
    [iterationsDraft, stressForm],
  );

  useEffect(() => {
    if (attacks.length === 0) return;
    const allowed = new Set(attacks.map((a) => a.id));
    const cur = stressForm.getValues('attackIds');
    const next = cur.filter((id) => allowed.has(id));
    if (next.length !== cur.length) {
      stressForm.setValue('attackIds', next, { shouldValidate: true, shouldDirty: true });
    }
  }, [attacks, stressForm]);

  const totalTests = (attackIdsWatch.length + (includeBaseline ? 1 : 0)) * (Number(iterationsWatch) || 0);

  const stopTests = useCallback(async () => {
    const jid = jobIdRef.current;
    if (jid) {
      try {
        await fetch(`${API_URL}/jobs/${jid}/cancel`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        });
      } catch {
        /* backend may still stop via aborted fetch */
      }
    }
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
  }, []);

  async function onStressSubmit(values: StressFormValues) {
    setError('');
    setRunCompleteFlash(false);
    setResults([]);
    setDone(false);
    setTestRunId(null);
    jobIdRef.current = null;
    setFlashIds(new Set());
    setPerAttackSummary({});
    const iterations = values.iterations;
    const totalCalc = (values.attackIds.length + (includeBaseline ? 1 : 0)) * iterations;
    setProgress({ current: 0, total: totalCalc, passed: 0, failed: 0 });

    const controller = new AbortController();
    abortRef.current = controller;

    const scoreThreshold = values.scoreThreshold ?? 0.45;

    try {
      const response = await fetch(`${API_URL}/testing/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` },
        body: JSON.stringify({
          attackIds: values.attackIds.filter((id) => id !== 'benign-baseline'),
          defenseIds: selectedDefenses,
          iterations,
          documentIds: documents.map((d) => d.id),
          includeBaseline,
          scoreThreshold,
          useJudgeEvaluation,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let msg = '';
        try {
          const j = (await response.json()) as { error?: string };
          if (typeof j?.error === 'string') msg = j.error;
        } catch {
          /* ignore non-JSON error body */
        }
        throw new Error(msg || `Request failed (${response.status})`);
      }
      if (!response.body) throw new Error('No response body from server');

      setRunning(true);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) currentEvent = line.slice(7);
          else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === 'start') {
                setProgress((p) => ({ ...p, total: data.totalTests }));
                setTestRunId(data.testRunId);
                if (data.jobId) jobIdRef.current = data.jobId;
              } else if (currentEvent === 'progress') {
                setProgress({ current: data.current, total: data.total, passed: data.passed, failed: data.failed });
                setResults((prev) => [...prev, data.result]);
                setFlashIds((prev) => { const next = new Set(prev); next.add(data.result.id); return next; });
                setTimeout(() => setFlashIds((prev) => { const next = new Set(prev); next.delete(data.result.id); return next; }), 400);
              } else if (currentEvent === 'done') {
                setDone(true);
                setTestRunId(data.testRunId);
                if (data.perAttackSummary) setPerAttackSummary(data.perAttackSummary);
              } else if (currentEvent === 'error') setError(data.error);
            } catch { /* ignore parse errors */ }
            currentEvent = '';
          }
        }
      }
    } catch (err: unknown) {
      const e = err as { name?: string };
      if (e.name !== 'AbortError') {
        setError(formatApiErrorForUser(err));
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  const filteredResults = useMemo(() =>
    results.filter((r) => filter === 'all' ? true : filter === 'passed' ? r.success : !r.success),
    [results, filter],
  );

  const progressWidthPct = progress.total > 0 ? Math.min(100, (progress.current / progress.total) * 100) : 0;
  const passRate = progress.current > 0 ? ((progress.passed / progress.current) * 100).toFixed(1) : '0.0';
  const readyToRun = attackIdsWatch.length > 0 && (Number(iterationsWatch) || 0) >= 1;

  const avgResultLatencyMs = useMemo(() => {
    if (results.length === 0) return 0;
    return results.reduce((acc, r) => acc + r.executionTimeMs, 0) / results.length;
  }, [results]);

  const progressSubline = useMemo(() => {
    const { current, total } = progress;
    if (total <= 0) return '0 / 0 tests';
    const left = Math.max(0, total - current);
    if (!running && done) {
      return `${total} / ${total} tests · complete`;
    }
    if (!running && !done && current > 0) {
      return `${current} / ${total} tests · stopped`;
    }
    if (avgResultLatencyMs > 0 && left > 0) {
      const est = Math.max(1, Math.round((left * avgResultLatencyMs) / 1000));
      return `${current} / ${total} tests · ~${est}s remaining`;
    }
    return `${current} / ${total} tests · estimating…`;
  }, [progress, running, done, avgResultLatencyMs]);

  const stressExportSlug = () => {
    const tag = testRunId != null ? String(testRunId) : 'batch';
    return `thrax-stress-${tag}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;
  };

  const handleExportStressJson = () => {
    if (results.length === 0) return;
    downloadJson(stressExportSlug(), {
      exportedAt: new Date().toISOString(),
      testRunId,
      progressSnapshot: progress,
      perAttackSummary,
      configuration: {
        attackIds: attackIdsWatch,
        iterations: iterationsWatch,
        defenseIds: selectedDefenses,
        includeBaseline,
        scoreThreshold: scoreThresholdWatch,
        useJudgeEvaluation,
        documentIds: documents.map((d) => d.id),
        documentNames: documents.map((d) => d.name),
      },
      results,
      runComplete: done,
    });
    notify.success('Exported stress batch (JSON)');
  };

  const handleExportStressCsv = () => {
    if (results.length === 0) return;
    const rows: Record<string, unknown>[] = results.map((r) => ({
      id: r.id,
      outcome: r.success ? 'defended' : 'breached',
      severity: r.severity,
      attack_name: r.name ?? r.attackName ?? '',
      attack_type: r.attackType,
      iteration: r.iteration ?? '',
      latency_ms: r.executionTimeMs,
      defenses: (r.defenses ?? []).join('; '),
      eval_reason: r.evalReason ?? '',
      prompt_preview: clipStressText(r.prompt, 4000),
      response_preview: clipStressText(r.response, 4000),
    }));
    downloadCsv(stressExportSlug(), Object.keys(rows[0]!), rows);
    notify.success('Exported stress batch (CSV)');
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-6">
      <PageHeader
        icon={<FlaskConical size={14} />}
        badgeLabel="Batch Evaluation"
        badgeClassName="border-violet-500/20 bg-violet-500/10 text-violet-300"
        title="Stress Test Workspace"
        description="Run repeated attack iterations, observe defense effectiveness in real time, and analyze failures without scrolling through a single oversized form."
        stats={
          <>
            <PageHeaderStat label="Iterations" value={String(iterationsWatch ?? '')} />
            <PageHeaderStat label="Attacks" value={`${attackIdsWatch.length} selected`} />
            <PageHeaderStat label="Defenses" value={`${selectedDefenses.length} active`} />
            <PageHeaderStat label="Documents" value={`${documents.length} attached`} />
          </>
        }
      />

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" role="alert">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      <section className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Setup</p>
          <h3 className="text-lg font-semibold text-foreground">Configure the batch run</h3>
        </div>

        <Card className="rounded-2xl">
          <CardContent className="p-4 md:p-6">
            <Form {...stressForm}>
              <form
                onSubmit={(e) => {
                  commitIterationsDraft();
                  void stressForm.handleSubmit(onStressSubmit)(e);
                }}
                className="contents"
              >
            <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.28fr)]">
              <div className="space-y-4">
                <Card className="shadow-none">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Sparkles size={16} className="text-violet-400" />
                      Test Parameters
                    </CardTitle>
                    <CardDescription>
                      Set iterations, evaluation threshold, and optional benign baseline (no injection) for control passes.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-0">
                    <FormField
                      control={stressForm.control}
                      name="iterations"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium text-muted-foreground">
                            Iterations per attack
                          </FormLabel>
                          <div className="flex h-[42px] items-center overflow-hidden rounded-xl border border-input bg-background shadow-sm transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
                            <button
                              type="button"
                              aria-label="Decrease iterations"
                              disabled={running || isStressSubmitting || (Number(field.value) || 0) <= 1}
                              onClick={() =>
                                field.onChange(Math.max(1, (Number(field.value) || 1) - 1))
                              }
                              className="flex h-full w-11 items-center justify-center border-r border-input bg-muted/20 font-bold text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
                            >
                              −
                            </button>
                            <FormControl>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={iterationsDraft}
                                onChange={(e) => {
                                  const val = e.target.value.replace(/\D/g, '');
                                  if (val === '') {
                                    setIterationsDraft('');
                                    return;
                                  }
                                  const parsed = parseInt(val, 10);
                                  if (Number.isFinite(parsed) && parsed <= 500) {
                                    setIterationsDraft(val);
                                  }
                                }}
                                onBlur={() => {
                                  commitIterationsDraft(Number(field.value));
                                  field.onBlur();
                                }}
                                disabled={running || isStressSubmitting}
                                className="flex-1 bg-transparent text-center text-sm font-semibold text-foreground outline-none disabled:opacity-50"
                                aria-label="Iterations per attack"
                              />
                            </FormControl>
                            <button
                              type="button"
                              aria-label="Increase iterations"
                              disabled={running || isStressSubmitting || (Number(field.value) || 0) >= 500}
                              onClick={() =>
                                field.onChange(Math.min(500, (Number(field.value) || 0) + 1))
                              }
                              className="flex h-full w-11 items-center justify-center border-l border-input bg-muted/20 font-bold text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
                            >
                              +
                            </button>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={stressForm.control}
                      name="scoreThreshold"
                      render={({ field }) => (
                        <FormItem>
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-muted-foreground">
                              Evaluation score threshold
                            </span>
                            <FormControl>
                              <input
                                id="threshold-input"
                                type="text"
                                inputMode="decimal"
                                value={scoreThresholdDraft}
                                onChange={(e) => {
                                  const raw = e.target.value.trim();
                                  if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
                                    setScoreThresholdDraft(raw);
                                    const parsed = Number(raw);
                                    if (raw !== '' && Number.isFinite(parsed)) {
                                      field.onChange(clampScoreThreshold(parsed));
                                    }
                                  }
                                }}
                                onBlur={() => {
                                  const parsed = Number(scoreThresholdDraft);
                                  const next = clampScoreThreshold(
                                    Number.isFinite(parsed) ? parsed : field.value ?? 0.45,
                                  );
                                  field.onChange(next);
                                  setScoreThresholdDraft(next.toFixed(2));
                                }}
                                disabled={running || isStressSubmitting}
                                className="h-8 w-20 rounded-md border border-input bg-background px-2 text-right text-sm font-semibold text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                                aria-label="Evaluation score threshold value"
                              />
                            </FormControl>
                          </div>
                          <FormControl>
                            <input
                              type="range"
                              min={SCORE_THRESHOLD_MIN}
                              max={SCORE_THRESHOLD_MAX}
                              step={0.01}
                              value={field.value ?? 0.45}
                              onChange={(e) => field.onChange(clampScoreThreshold(Number(e.target.value)))}
                              disabled={running || isStressSubmitting}
                              className="w-full accent-primary disabled:opacity-50"
                            />
                          </FormControl>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Type a value or drag the slider. Lower values are stricter; higher values are more permissive.
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-xs font-medium text-foreground">Include benign baseline</p>
                          <p className="text-[11px] leading-relaxed text-muted-foreground">
                            Adds a no-injection control per iteration to detect false positives when defenses block safe content.
                          </p>
                        </div>
                        <Switch
                          checked={includeBaseline}
                          onCheckedChange={setIncludeBaseline}
                          disabled={running || isStressSubmitting}
                          aria-label="Include benign baseline in stress test"
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-border bg-background px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                      {documents.length === 0
                        ? 'No documents are currently attached. The run still uses synthetic corporate fixtures so injections have realistic context.'
                        : `${documents.length} document(s) from Document Management will be prepended to each test iteration.`}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <Card className="shadow-none">
                  <CardHeader className="pb-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Zap size={16} className="text-amber-400" />
                          Attack Vectors
                        </CardTitle>
                        <CardDescription>Pick the attack library entries to replay across repeated iterations.</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button type="button" onClick={selectAllAttacks} disabled={running || isStressSubmitting} size="sm" variant="outline">Select all</Button>
                        <Button type="button" onClick={deselectAllAttacks} disabled={running || isStressSubmitting} size="sm" variant="ghost">Clear</Button>
                        <span className="text-xs text-muted-foreground">{attackIdsWatch.length} / {attacks.length}</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      {attacks.map((a) => {
                        const selected = attackIdsWatch.includes(a.id);
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => toggleAttack(a.id)}
                            disabled={running || isStressSubmitting}
                            className={cn(
                              'rounded-xl border p-4 text-left transition-all duration-150 disabled:opacity-50',
                              selected ? 'border-amber-500/30 bg-amber-500/5' : 'border-border bg-background hover:border-muted-foreground',
                            )}
                          >
                            <div className="mb-1 flex items-center gap-2">
                              <div className={cn('flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border', selected ? 'border-amber-500 bg-amber-500' : 'border-muted-foreground')}>
                                {selected && <Check size={10} className="text-white" strokeWidth={3} />}
                              </div>
                              <span className="truncate text-sm font-medium text-foreground">{a.name}</span>
                            </div>
                            <div className="flex gap-2 pl-6">
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[0.6rem] text-muted-foreground">{a.category}</span>
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[0.6rem] text-muted-foreground">{a.tier}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <FormField
                      control={stressForm.control}
                      name="attackIds"
                      render={() => (
                        <FormItem className="mt-2">
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card className="shadow-none">
                  <CardHeader className="pb-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Shield size={16} className="text-safe" />
                          Defense Pipeline
                        </CardTitle>
                        <CardDescription>Toggle the active defenses for this batch run.</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button type="button" onClick={selectAllDefenses} disabled={running || isStressSubmitting} size="sm" variant="outline">Select all</Button>
                        <Button type="button" onClick={deselectAllDefenses} disabled={running || isStressSubmitting} size="sm" variant="ghost">Clear</Button>
                        <span className="text-xs text-muted-foreground">{selectedDefenses.length} / {defenses.length}</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex flex-wrap gap-2">
                      {defenses.map((d) => {
                        const active = selectedDefenses.includes(d.id);
                        return (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => toggleDefense(d.id)}
                            disabled={running || isStressSubmitting}
                            className={cn(
                              'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors disabled:opacity-50',
                              active ? 'border-safe/30 bg-safe/10 text-safe' : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                            )}
                          >
                            <span className={cn('h-2 w-2 rounded-full', active ? 'bg-safe' : 'bg-muted-foreground')} />
                            <Shield size={14} />
                            {d.name}
                            <span className="text-[0.6rem] opacity-70">({d.type})</span>
                          </button>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-border/70 bg-muted/20 p-4 md:p-5">
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full bg-background px-3 py-1 text-xs font-medium text-foreground">
                  {attackIdsWatch.length} attack vector(s)
                </span>
                <span className="inline-flex items-center rounded-full bg-background px-3 py-1 text-xs font-medium text-foreground">
                  {selectedDefenses.length} defense(s)
                </span>
                <span className="inline-flex items-center rounded-full bg-background px-3 py-1 text-xs font-medium text-foreground">
                  {totalTests} total tests
                </span>
                <span className="inline-flex items-center rounded-full bg-background px-3 py-1 text-xs font-medium text-foreground">
                  Threshold {(scoreThresholdWatch ?? 0.45).toFixed(2)}
                </span>
                {includeBaseline && (
                  <span className="inline-flex items-center rounded-full bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-400">
                    Benign baseline on
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-medium text-foreground">Enable Judge Evaluation</p>
                      {!useJudgeEvaluation ? (
                        <span className="text-warn text-xs">Quota-safe</span>
                      ) : (
                        <span className="text-primary text-xs">Judge active</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Uses Qwen as a secondary scoring signal (+1 API call per iteration). Disable to preserve free-tier quota.
                    </p>
                  </div>
                  <Switch
                    checked={useJudgeEvaluation}
                    onCheckedChange={setUseJudgeEvaluation}
                    disabled={running || isStressSubmitting}
                    aria-label="Enable judge evaluation for stress test scoring"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-muted-foreground">
                  {readyToRun
                    ? 'Ready to run a repeatable evaluation set and review defended versus breached outcomes.'
                    : 'Select at least one attack vector before starting the run.'}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                  {runCompleteFlash ? (
                    <Button size="lg" variant="outline" disabled className="min-w-[180px] gap-2 border-safe/40 text-safe" aria-label="Run completed">
                      <CheckCircle2 size={18} className="text-safe" aria-hidden="true" />
                      Completed
                    </Button>
                  ) : !running ? (
                    <Button
                      type="submit"
                      disabled={!readyToRun || running || isStressSubmitting}
                      size="lg"
                      className="min-w-[180px] gap-2"
                    >
                      {isStressSubmitting && !running ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Starting run…
                        </>
                      ) : (
                        <>
                          <Play size={16} />
                          Run {totalTests} Tests
                        </>
                      )}
                    </Button>
                  ) : (
                    <>
                      <Button type="button" variant="outline" size="lg" disabled className="min-w-[180px] gap-2">
                        <Loader2 size={16} className="animate-spin" />
                        Running {progress.current}/{progress.total}…
                      </Button>
                      <Button type="button" onClick={stopTests} variant="destructive" size="lg" className="min-w-[180px]">
                        <Square size={14} />
                        Stop Run
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </section>

      {(running || results.length > 0) && (
        <>
          <section className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Run And Observe</p>
              <h3 className="text-lg font-semibold text-foreground">Track progress and outcome quality</h3>
            </div>

            <Card className="rounded-2xl">
              <CardContent className="space-y-5 p-5 md:p-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {running ? (
                      <>
                        <Loader2 size={14} className="animate-spin text-primary" />
                        Running {progress.current} / {progress.total}
                      </>
                    ) : done ? (
                      <>
                        <CheckCircle2 size={14} className="text-safe" />
                        Completed
                      </>
                    ) : (
                      'Stopped'
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {passRate}% defense effectiveness {testRunId && <span className="ml-2 text-muted-foreground/60">Run #{testRunId}</span>}
                  </span>
                </div>

                <div>
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                    <motion.div
                      className="relative h-2 rounded-full bg-primary"
                      initial={{ width: '0%' }}
                      animate={{ width: `${progressWidthPct}%` }}
                      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                    >
                      {running && progressWidthPct > 0 && progressWidthPct < 100 ? (
                        <span
                          className="pointer-events-none absolute right-0 top-1/2 h-2 w-2 -translate-y-1/2 translate-x-1/2 rounded-full bg-primary blur-sm"
                          aria-hidden
                        />
                      ) : null}
                    </motion.div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground tabular-nums">{progressSubline}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: 'Executed', value: progress.current, cls: 'text-foreground' },
                    { label: 'Defended', value: progress.passed, cls: 'text-safe' },
                    { label: 'Breached', value: progress.failed, cls: 'text-threat' },
                    { label: 'Defense Rate', value: `${passRate}%`, cls: 'text-amber-400' },
                  ].map(({ label, value, cls }) => (
                    <div key={label} className="rounded-xl bg-muted/30 p-4 text-center">
                      <div className={cn('text-xl font-bold', cls)}>{value}</div>
                      <div className="text-xs text-muted-foreground">{label}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {done && Object.keys(perAttackSummary).length > 0 && (
              <Card className="rounded-2xl">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BarChart3 size={16} className="text-primary" />
                    Per-Attack Breakdown
                  </CardTitle>
                  <CardDescription>Review how each attack family performed across the completed batch.</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {Object.entries(perAttackSummary).map(([attackId, summary]) => {
                      const rate = summary.total > 0 ? ((summary.passed / summary.total) * 100).toFixed(0) : '0';
                      const attack = attacks.find(a => a.id === attackId);
                      return (
                        <div key={attackId} className="rounded-xl border border-border bg-muted/20 p-4">
                          <div className="mb-2 truncate text-sm font-medium text-foreground">{attack?.name || attackId}</div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-safe">Defended {summary.passed}</span>
                            <span className="text-threat">Breached {summary.failed}</span>
                            <span className="text-muted-foreground">{summary.avgLatency}ms avg</span>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[0.65rem] text-muted-foreground">
                            <span>+Judge latency {summary.avgAddedLatencyMs}ms</span>
                            <span>Judge tokens {summary.avgTokenOverhead}</span>
                            <span>Calls {summary.avgJudgeCalls.toFixed(2)}</span>
                          </div>
                          <div className="mt-1 text-right text-[0.65rem] text-muted-foreground">
                            Est. judge cost ${summary.totalEstimatedJudgeCostUsd.toFixed(4)}
                          </div>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn('h-full rounded-full', parseFloat(rate) >= 80 ? 'bg-safe' : parseFloat(rate) >= 50 ? 'bg-warn' : 'bg-destructive')}
                              style={{ width: `${rate}%` }}
                            />
                          </div>
                          <div className="mt-2 text-right text-[0.7rem] font-medium">
                            <span className={parseFloat(rate) >= 80 ? 'text-safe' : parseFloat(rate) >= 50 ? 'text-warn' : 'text-destructive'}>
                              {rate}% defended
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </section>

          <section className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Analyze</p>
              <h3 className="text-lg font-semibold text-foreground">Inspect run results and expand individual failures</h3>
            </div>

            <Card className="overflow-hidden rounded-2xl">
              <div className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
                <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <ListFilter size={16} className="text-primary" />
                      Result Stream
                    </div>
                    <div className="text-xs text-muted-foreground">Filter the batch output and expand any run for prompt/response detail.</div>
                  </div>
                  <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={results.length === 0}
                        className="gap-1.5"
                        onClick={handleExportStressJson}
                      >
                        <Download size={14} aria-hidden /> JSON
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={results.length === 0}
                        className="gap-1.5"
                        onClick={handleExportStressCsv}
                      >
                        <Download size={14} aria-hidden /> CSV
                      </Button>
                    </div>
                    <div className="flex w-full gap-1 rounded-lg bg-muted/30 p-1 md:w-auto md:max-w-fit">
                    {(['all', 'passed', 'failed'] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={cn(
                          'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors md:flex-none',
                          filter === f ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {f === 'all' ? `All (${results.length})` : f === 'passed' ? `Defended (${progress.passed})` : `Breached (${progress.failed})`}
                      </button>
                    ))}
                  </div>
                  </div>
                </div>
              </div>

              <CardContent className="p-4 md:p-5">
                <div ref={resultsContainerRef} className="space-y-2">
                {filteredResults.map((r) => {
                  const evaluatorConfidencePct =
                    normalizeEvaluatorConfidence(
                      r.evaluatorConfidencePct
                      ?? (typeof r.defenseState?.evaluationSummary?.finalScore === 'number'
                        ? r.defenseState.evaluationSummary.finalScore * 100
                        : undefined),
                    );
                  const pipelineConfidencePct = normalizePipelineConfidence(
                    r.pipelineConfidencePct ?? r.pipelineConfidence,
                  );

                  return (
                  <motion.div
                    key={r.id}
                    initial={{ y: 8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                    className={cn(
                      'overflow-hidden rounded-xl border bg-card transition-all',
                      r.success ? 'border-border' : 'border-destructive/30',
                      flashIds.has(r.id) && (r.success ? 'ring-2 ring-safe/30' : 'ring-2 ring-threat/30'),
                    )}
                  >
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                      aria-expanded={expandedTest === r.id}
                      aria-controls={`result-details-${r.id}`}
                      onClick={() => setExpandedTest(expandedTest === r.id ? null : r.id)}
                    >
                      <span
                        className={cn(
                          'inline-flex flex-shrink-0 items-center gap-1.5 rounded px-2 py-0.5 text-[0.65rem] font-medium border bg-transparent',
                          r.success ? 'border-safe/30 text-safe' : 'border-threat/30 text-threat'
                        )}
                        aria-label={r.success ? 'Result: Defended' : 'Result: Breached'}
                      >
                        {r.success ? <span className="h-1.5 w-1.5 rounded-full bg-safe" aria-hidden="true"></span> : <span className="h-1.5 w-1.5 rounded-full bg-threat animate-pulse-slow" aria-hidden="true"></span>}
                        {r.success ? 'Defended' : 'Breached'}
                      </span>
                      <span className="flex-1 truncate text-sm font-medium text-foreground">{r.name}</span>
                      <span className={cn('rounded px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase', getSeverityClass(r.severity))}>{r.severity}</span>
                      <span className="text-xs text-muted-foreground">{r.executionTimeMs}ms</span>
                      <ChevronDown size={14} className={cn('text-muted-foreground transition-transform', expandedTest === r.id && 'rotate-180')} />
                    </button>
                    {expandedTest === r.id && (
                      <div id={`result-details-${r.id}`} className="space-y-3 border-t border-border px-4 pb-4 pt-3">
                        <div className="grid gap-3 xl:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">Prompt</label>
                            <pre className="rounded-xl bg-muted p-3 text-xs text-foreground whitespace-pre-wrap">{r.prompt}</pre>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">Response</label>
                            <pre className="rounded-xl bg-muted p-3 text-xs text-foreground whitespace-pre-wrap">{r.response}</pre>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                          <span>Result: <strong className={r.success ? 'text-safe' : 'text-threat'}>{r.actualBehavior}</strong></span>
                          {evaluatorConfidencePct !== undefined && (
                            <span>Evaluator confidence: <strong className="text-foreground">{evaluatorConfidencePct}%</strong></span>
                          )}
                          {pipelineConfidencePct !== undefined && (
                            <span>Pipeline confidence: <strong className="text-foreground">{pipelineConfidencePct}%</strong></span>
                          )}
                          {r.severityMetric && (
                            <span>
                              Severity Score: <strong className="text-foreground">{r.severityMetric.score}</strong>
                              {formatSeverityKind(r.severityMetric.kind) && (
                                <span className="ml-1 capitalize">({formatSeverityKind(r.severityMetric.kind)})</span>
                              )}
                            </span>
                          )}
                          {typeof r.defenseState?.evaluationSummary?.scoreThresholdUsed === 'number' && (
                            <span>
                              Threshold: <strong className="text-foreground">{r.defenseState.evaluationSummary.scoreThresholdUsed.toFixed(2)}</strong>
                            </span>
                          )}
                          {r.defenseEconomics && (
                            <span>
                              Judge overhead: <strong className="text-foreground">{r.defenseEconomics.addedLatencyMs}ms / {r.defenseEconomics.tokenOverhead} tokens</strong>
                            </span>
                          )}
                          <span>Attack: <strong className="text-foreground">{r.attackType}</strong></span>
                          <span>Defenses: <strong className="text-foreground">{r.defenses.length > 0 ? r.defenses.join(', ') : 'none'}</strong></span>
                        </div>
                        {r.evalReason && (
                          <div className="text-xs text-muted-foreground">
                            Reason: <strong className="font-medium text-foreground">{r.evalReason}</strong>
                          </div>
                        )}
                        {r.defenseState?.pipelineResult &&
                          (r.defenseState.pipelineResult.verdicts?.length ?? 0) > 0 && (
                            <TooltipProvider delayDuration={0}>
                              <div className="space-y-2">
                                {r.defenseState.pipelineResult.forcedJudgeActive === true &&
                                  !(r.defenses?.includes('llm-judge') ?? false) && (
                                    <div className="flex items-center gap-2 text-xs text-warn bg-warn/10 border border-warn/20 rounded px-3 py-2">
                                      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                                      <span>Session escalation detected — Judge (Qwen) is active for this session</span>
                                    </div>
                                  )}
                                <label className="block text-xs font-medium text-muted-foreground">Defense verdicts</label>
                                <div className="rounded-xl bg-muted p-3 space-y-1.5">
                                  {(r.defenseState.pipelineResult.verdicts || []).map((v, i) => (
                                    <div key={i} className="text-xs flex items-start gap-2">
                                      <span
                                        className={cn(
                                          'mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0',
                                          v.triggered ? 'bg-destructive' : 'bg-safe',
                                        )}
                                      />
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-1.5 font-medium text-foreground">
                                          <span>{v.defenseName}</span>
                                          {v.defenseId === 'turn-tracker' &&
                                            r.defenseState?.pipelineResult?.forcedJudgeActive === true && (
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <button
                                                    type="button"
                                                    className="inline-flex rounded p-0.5 text-warn hover:bg-warn/10"
                                                    aria-label="Forced judge session"
                                                  >
                                                    <AlertTriangle className="h-3 w-3" />
                                                  </button>
                                                </TooltipTrigger>
                                                <TooltipContent side="top" className="max-w-xs text-xs">
                                                  {FORCED_JUDGE_SESSION_TOOLTIP}
                                                </TooltipContent>
                                              </Tooltip>
                                            )}
                                        </div>
                                        <p className="text-muted-foreground mt-0.5">
                                          {v.details.substring(0, 160)}
                                          {v.details.length > 160 ? '…' : ''}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </TooltipProvider>
                          )}
                      </div>
                    )}
                  </motion.div>
                );
                })}
                <div ref={resultsEndRef} />
                </div>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
