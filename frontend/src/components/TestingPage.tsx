import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  FlaskConical, Play, Loader, CheckCircle, XCircle,
  ChevronDown, Square, Check, AlertTriangle, Shield, Zap, Lock,
  BarChart3, ListFilter, Sparkles,
} from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { cn } from '@/lib/utils';
import type { DefenseEconomics, Document, SeverityLevel, StressSeverityMetric } from '../../../shared/types';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

const API_URL = '/api';
const SCORE_THRESHOLD_MIN = 0.05;
const SCORE_THRESHOLD_MAX = 0.95;

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
  defenseState?: { evaluationSummary?: { scoreThresholdUsed?: number; finalScore?: number } };
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

function clampScoreThreshold(value: number): number {
  if (!Number.isFinite(value)) return SCORE_THRESHOLD_MIN;
  return Number(Math.min(SCORE_THRESHOLD_MAX, Math.max(SCORE_THRESHOLD_MIN, value)).toFixed(2));
}

function normalizePipelineConfidence(value?: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Number(Math.min(100, Math.max(0, value)).toFixed(1));
}

function normalizeEvaluatorConfidence(value?: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Number(Math.min(100, Math.max(0, value)).toFixed(1));
}

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
  const [selectedAttacks, setSelectedAttacks] = useState<string[]>([]);
  const [selectedDefenses, setSelectedDefenses] = useState<string[]>([]);
  const [includeBaseline, setIncludeBaseline] = useState(true);
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
  const [iterations, setIterations] = useState(50);
  const [scoreThreshold, setScoreThreshold] = useState(0.45);
  const [scoreThresholdInput, setScoreThresholdInput] = useState('0.45');
  const abortRef = useRef<AbortController | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const resultsEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    Promise.all([
      axios.get(`${API_URL}/attacks`),
      axios.get(`${API_URL}/defenses`),
    ]).then(([atkRes, defRes]) => {
      setAttacks(atkRes.data);
      setDefenses(defRes.data);
      // Auto-select all enabled defenses
      setSelectedDefenses(defRes.data.filter((d: DefenseOption) => d.enabled).map((d: DefenseOption) => d.id));
    }).catch(() => setError('Failed to load attacks/defenses. Is the backend running?'));
  }, []);

  useEffect(() => {
    if (running && resultsEndRef.current) resultsEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [results.length, running]);

  useEffect(() => {
    setScoreThresholdInput(scoreThreshold.toFixed(2));
  }, [scoreThreshold]);

  const toggleAttack = useCallback((id: string) => {
    setSelectedAttacks((prev) => prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]);
  }, []);

  const toggleDefense = useCallback((id: string) => {
    setSelectedDefenses((prev) => prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]);
  }, []);

  const selectAllAttacks = useCallback(() => {
    setSelectedAttacks(attacks.map((a) => a.id));
  }, [attacks]);

  const deselectAllAttacks = useCallback(() => {
    setSelectedAttacks([]);
  }, []);

  const selectAllDefenses = useCallback(() => {
    setSelectedDefenses(defenses.map((d) => d.id));
  }, [defenses]);

  const deselectAllDefenses = useCallback(() => {
    setSelectedDefenses([]);
  }, []);

  const totalTests = (selectedAttacks.length + (includeBaseline ? 1 : 0)) * iterations;

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

  const runTests = useCallback(async () => {
    if (selectedAttacks.length === 0) { setError('Select at least one attack'); return; }
    if (iterations < 1) { setError('Iterations must be at least 1'); return; }
    setRunning(true); setError(''); setResults([]); setDone(false); setTestRunId(null);
    jobIdRef.current = null;
    setFlashIds(new Set()); setPerAttackSummary({});
    setProgress({ current: 0, total: totalTests, passed: 0, failed: 0 });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`${API_URL}/testing/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` },
        body: JSON.stringify({
          attackIds: selectedAttacks,
          defenseIds: selectedDefenses,
          iterations,
          documentIds: documents.map((d) => d.id),
          includeBaseline,
          scoreThreshold,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) throw new Error('Failed to start stress test');

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
    } catch (err: any) {
      if (err.name !== 'AbortError') setError(err.message || 'Stress test failed');
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [selectedAttacks, selectedDefenses, totalTests, iterations, documents, includeBaseline, scoreThreshold]);

  const filteredResults = useMemo(() =>
    results.filter((r) => filter === 'all' ? true : filter === 'passed' ? r.success : !r.success),
    [results, filter],
  );

  const pct = progress.total > 0 ? ((progress.current / progress.total) * 100).toFixed(1) : '0';
  const passRate = progress.current > 0 ? ((progress.passed / progress.current) * 100).toFixed(1) : '0.0';
  const readyToRun = selectedAttacks.length > 0 && iterations >= 1;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-6">
      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">
              <FlaskConical size={14} />
              Batch Evaluation
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600">
                <FlaskConical size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Stress Test Workspace</h2>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                  Run repeated attack iterations, observe defense effectiveness in real time, and analyze failures without scrolling through a single oversized form.
                </p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Iterations</div>
              <div className="mt-1 text-sm font-medium text-foreground">{iterations}</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Attacks</div>
              <div className="mt-1 text-sm font-medium text-foreground">{selectedAttacks.length} selected</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Defenses</div>
              <div className="mt-1 text-sm font-medium text-foreground">{selectedDefenses.length} active</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Documents</div>
              <div className="mt-1 text-sm font-medium text-foreground">{documents.length} attached</div>
            </div>
          </div>
        </div>
      </section>

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
            <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.28fr)]">
              <div className="space-y-4">
                <Card className="shadow-none">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Sparkles size={16} className="text-violet-400" />
                      Test Parameters
                    </CardTitle>
                    <CardDescription>Set the run size and decide whether to include a benign baseline.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-0">
                    <div>
                      <label className="mb-2 block text-xs font-medium text-muted-foreground">Iterations per attack</label>
                      <div className="flex h-[42px] items-center overflow-hidden rounded-xl border border-input bg-background shadow-sm transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
                        <button
                          type="button"
                          aria-label="Decrease iterations"
                          disabled={running || iterations <= 1}
                          onClick={() => setIterations(prev => Math.max(1, prev - 1))}
                          className="flex h-full w-11 items-center justify-center border-r border-input bg-muted/20 font-bold text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
                        >
                          −
                        </button>
                        <input
                          type="text"
                          value={iterations}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            if (val === '') {
                              (setIterations as any)('');
                            } else {
                              setIterations(Math.min(100, Math.max(1, parseInt(val))));
                            }
                          }}
                          onBlur={() => {
                            if (!iterations || iterations < 1) setIterations(1);
                          }}
                          disabled={running}
                          className="flex-1 bg-transparent text-center text-sm font-semibold text-foreground outline-none disabled:opacity-50"
                        />
                        <button
                          type="button"
                          aria-label="Increase iterations"
                          disabled={running || iterations >= 100}
                          onClick={() => setIterations(prev => Math.min(100, (Number(prev) || 0) + 1))}
                          className="flex h-full w-11 items-center justify-center border-l border-input bg-muted/20 font-bold text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <label htmlFor="baseline-toggle" className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3">
                      <input
                        type="checkbox"
                        id="baseline-toggle"
                        checked={includeBaseline}
                        onChange={(e) => setIncludeBaseline(e.target.checked)}
                        disabled={running}
                        className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-primary/30 outline-none disabled:opacity-50"
                      />
                      <div>
                        <div className="text-sm font-semibold text-foreground">Include Benign Baseline</div>
                        <div className="text-xs leading-relaxed text-muted-foreground">
                          Tracks false positives by mixing non-adversarial prompts into the run.
                        </div>
                      </div>
                    </label>

                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <label htmlFor="threshold-input" className="text-xs font-medium text-muted-foreground">Evaluation score threshold</label>
                        <input
                          id="threshold-input"
                          type="text"
                          inputMode="decimal"
                          value={scoreThresholdInput}
                          onChange={(e) => {
                            const raw = e.target.value.trim();
                            if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
                              setScoreThresholdInput(raw);
                              const parsed = Number(raw);
                              if (raw !== '' && Number.isFinite(parsed)) {
                                setScoreThreshold(clampScoreThreshold(parsed));
                              }
                            }
                          }}
                          onBlur={() => {
                            const parsed = Number(scoreThresholdInput);
                            const next = clampScoreThreshold(Number.isFinite(parsed) ? parsed : scoreThreshold);
                            setScoreThreshold(next);
                            setScoreThresholdInput(next.toFixed(2));
                          }}
                          disabled={running}
                          className="h-8 w-20 rounded-md border border-input bg-background px-2 text-right text-sm font-semibold text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                          aria-label="Evaluation score threshold value"
                        />
                      </div>
                      <input
                        type="range"
                        min={SCORE_THRESHOLD_MIN}
                        max={SCORE_THRESHOLD_MAX}
                        step={0.01}
                        value={scoreThreshold}
                        onChange={(e) => setScoreThreshold(clampScoreThreshold(Number(e.target.value)))}
                        disabled={running}
                        className="w-full accent-primary disabled:opacity-50"
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Type a value or drag the slider. Lower values are stricter; higher values are more permissive.
                      </p>
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
                        <Button onClick={selectAllAttacks} disabled={running} size="sm" variant="outline">Select all</Button>
                        <Button onClick={deselectAllAttacks} disabled={running} size="sm" variant="ghost">Clear</Button>
                        <span className="text-xs text-muted-foreground">{selectedAttacks.length} / {attacks.length}</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      {attacks.map((a) => {
                        const selected = selectedAttacks.includes(a.id);
                        return (
                          <button
                            key={a.id}
                            onClick={() => toggleAttack(a.id)}
                            disabled={running}
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
                  </CardContent>
                </Card>

                <Card className="shadow-none">
                  <CardHeader className="pb-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Shield size={16} className="text-green-400" />
                          Defense Pipeline
                        </CardTitle>
                        <CardDescription>Toggle the active defenses for this batch run.</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button onClick={selectAllDefenses} disabled={running} size="sm" variant="outline">Select all</Button>
                        <Button onClick={deselectAllDefenses} disabled={running} size="sm" variant="ghost">Clear</Button>
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
                            onClick={() => toggleDefense(d.id)}
                            disabled={running}
                            className={cn(
                              'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors disabled:opacity-50',
                              active ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                            )}
                          >
                            <span className={cn('h-2 w-2 rounded-full', active ? 'bg-green-400' : 'bg-muted-foreground')} />
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
                  {selectedAttacks.length} attack vector(s)
                </span>
                <span className="inline-flex items-center rounded-full bg-background px-3 py-1 text-xs font-medium text-foreground">
                  {selectedDefenses.length} defense(s)
                </span>
                <span className="inline-flex items-center rounded-full bg-background px-3 py-1 text-xs font-medium text-foreground">
                  {includeBaseline ? 'Baseline included' : 'No baseline'}
                </span>
                <span className="inline-flex items-center rounded-full bg-background px-3 py-1 text-xs font-medium text-foreground">
                  {totalTests} total tests
                </span>
                <span className="inline-flex items-center rounded-full bg-background px-3 py-1 text-xs font-medium text-foreground">
                  Threshold {scoreThreshold.toFixed(2)}
                </span>
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-muted-foreground">
                  {readyToRun
                    ? 'Ready to run a repeatable evaluation set and compare defended vs breached outcomes.'
                    : 'Select at least one attack vector before starting the run.'}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {!running ? (
                    <Button onClick={runTests} disabled={!readyToRun || running} size="lg" className="min-w-[180px]">
                      <Play size={16} />
                      Run {totalTests} Tests
                    </Button>
                  ) : (
                    <Button onClick={stopTests} variant="destructive" size="lg" className="min-w-[180px]">
                      <Square size={14} />
                      Stop Run
                    </Button>
                  )}
                </div>
              </div>
            </div>
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
                        <Loader size={14} className="animate-spin text-primary" />
                        Running {progress.current} / {progress.total}
                      </>
                    ) : done ? (
                      <>
                        <CheckCircle size={14} className="text-green-400" />
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

                <div className="relative h-3 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
                  {parseFloat(pct) > 8 && (
                    <span className="absolute inset-0 flex items-center justify-center text-[0.6rem] font-bold text-primary-foreground">{pct}%</span>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: 'Executed', value: progress.current, cls: 'text-foreground' },
                    { label: 'Defended', value: progress.passed, cls: 'text-green-400' },
                    { label: 'Breached', value: progress.failed, cls: 'text-destructive' },
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
                            <span className="text-green-400">Defended {summary.passed}</span>
                            <span className="text-destructive">Breached {summary.failed}</span>
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
                              className={cn('h-full rounded-full', parseFloat(rate) >= 80 ? 'bg-green-500' : parseFloat(rate) >= 50 ? 'bg-amber-500' : 'bg-destructive')}
                              style={{ width: `${rate}%` }}
                            />
                          </div>
                          <div className="mt-2 text-right text-[0.7rem] font-medium">
                            <span className={parseFloat(rate) >= 80 ? 'text-green-400' : parseFloat(rate) >= 50 ? 'text-amber-400' : 'text-destructive'}>
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
                  <div className="flex w-full gap-1 rounded-lg bg-muted/30 p-1 md:w-auto">
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

              <CardContent className="space-y-2 p-4 md:p-5">
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
                  <div
                    key={r.id}
                    className={cn(
                      'overflow-hidden rounded-xl border bg-card transition-all',
                      r.success ? 'border-border' : 'border-destructive/30',
                      flashIds.has(r.id) && (r.success ? 'ring-2 ring-green-500/30' : 'ring-2 ring-red-500/30'),
                    )}
                  >
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                      aria-expanded={expandedTest === r.id}
                      aria-controls={`result-details-${r.id}`}
                      onClick={() => setExpandedTest(expandedTest === r.id ? null : r.id)}
                    >
                      {r.success ? <CheckCircle size={16} className="flex-shrink-0 text-green-400" /> : <XCircle size={16} className="flex-shrink-0 text-destructive" />}
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
                          <span>Result: <strong className={r.success ? 'text-green-400' : 'text-destructive'}>{r.actualBehavior}</strong></span>
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
                      </div>
                    )}
                  </div>
                );
                })}
                <div ref={resultsEndRef} />
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
