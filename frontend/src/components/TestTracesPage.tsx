import { Fragment, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../services/api';
import { TestTrace, TestRunListItem } from '../../../shared/types';
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  FileText,
  Shield,
  Zap,
  Clock,
  CheckCircle,
  XCircle,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

type RunScope = 'latest' | 'all' | number;

/** Human-readable attack label from `attackId` or legacy `testCaseId` (`attackId-iter-N`). */
function parseAttackName(attackKey: string): string {
  const match = attackKey.match(/^(.+?)-iter-\d+$/);
  const attackId = match ? match[1] : attackKey;
  return attackId
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Iteration suffix from synthetic stress IDs, when present. */
function parseIterationIndex(testCaseId: string): number | undefined {
  const match = testCaseId.match(/-iter-(\d+)$/);
  return match ? parseInt(match[1], 10) : undefined;
}

function rowKey(trace: TestTrace, fallbackIndex: number): string {
  if (trace.resultId != null) return `r-${trace.resultId}`;
  return trace.testCaseId ? `t-${trace.testCaseId}-${fallbackIndex}` : `row-${fallbackIndex}`;
}

function formatWhen(iso?: string | Date): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function mergeConsecutiveRuns(traces: TestTrace[]): {
  testRunId: number;
  runName?: string;
  runStartedAt?: Date;
  traces: TestTrace[];
}[] {
  const chunks: { testRunId: number; runName?: string; runStartedAt?: Date; traces: TestTrace[] }[] = [];
  for (const t of traces) {
    const last = chunks[chunks.length - 1];
    if (last && last.testRunId === t.testRunId) last.traces.push(t);
    else {
      chunks.push({
        testRunId: t.testRunId,
        runName: t.runName,
        runStartedAt: t.runStartedAt,
        traces: [t],
      });
    }
  }
  return chunks;
}

function runStatusTone(status: TestRunListItem['status']): string {
  switch (status) {
    case 'completed':
      return 'border-safe/25 bg-safe/10 text-safe';
    case 'running':
      return 'border-primary/25 bg-primary/10 text-primary';
    case 'cancelled':
      return 'border-amber-500/25 bg-amber-500/10 text-amber-400';
    case 'failed':
    default:
      return 'border-destructive/25 bg-destructive/10 text-destructive';
  }
}

export default function TestTracesPage() {
  const [runs, setRuns] = useState<TestRunListItem[]>([]);
  const [runsReady, setRunsReady] = useState(false);

  const [traces, setTraces] = useState<TestTrace[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [loadingDetailId, setLoadingDetailId] = useState<number | null>(null);

  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [runScope, setRunScope] = useState<RunScope>('latest');
  const [successFilter, setSuccessFilter] = useState<'all' | 'true' | 'false'>('all');
  const [providerFilter, setProviderFilter] = useState('');
  const [attackTypeFilter, setAttackTypeFilter] = useState('');
  const [runPickerOpen, setRunPickerOpen] = useState(false);
  const [runSearch, setRunSearch] = useState('');
  const runSearchInputRef = useRef<HTMLInputElement>(null);
  const requestSeqRef = useRef(0);
  /** Refreshed synchronously before `fetchTraces` so Refresh matches the newest run list. */
  const runsRef = useRef<TestRunListItem[]>([]);
  runsRef.current = runs;

  const resolvedTestRunId = useMemo(() => {
    if (runScope === 'all') return undefined;
    if (typeof runScope === 'number') return runScope;
    return runs[0]?.id;
  }, [runScope, runs]);

  const activeRun = useMemo(() => {
    if (typeof runScope === 'number') return runs.find((r) => r.id === runScope) ?? null;
    if (runScope === 'latest') return runs[0] ?? null;
    return null;
  }, [runScope, runs]);

  const isSingleRunView = resolvedTestRunId !== undefined;

  const fetchRuns = useCallback(async () => {
    try {
      const list = await api.getTestRuns(150);
      setRuns(list);
    } catch (e) {
      console.error(e);
    } finally {
      setRunsReady(true);
    }
  }, []);

  const fetchTraces = useCallback(async () => {
    const requestId = ++requestSeqRef.current;
    setLoading(true);
    try {
      const snapshot = runsRef.current;
      const runIdFilter =
        runScope === 'all'
          ? undefined
          : typeof runScope === 'number'
            ? runScope
            : snapshot[0]?.id;

      if (runScope === 'latest' && snapshot.length === 0) {
        if (requestId === requestSeqRef.current) {
          setTraces([]);
          setTotal(0);
        }
        return;
      }

      const filters: Parameters<typeof api.getTestTraces>[0] = { limit, offset };
      if (runIdFilter !== undefined) filters.testRunId = runIdFilter;
      if (successFilter !== 'all') filters.success = successFilter === 'true';
      if (providerFilter) filters.llmProvider = providerFilter;
      if (attackTypeFilter) filters.attackType = attackTypeFilter;

      const res = await api.getTestTraces(filters);
      if (requestId === requestSeqRef.current) {
        setTraces(res.data);
        setTotal(res.total);
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (requestId === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [
    attackTypeFilter,
    limit,
    offset,
    providerFilter,
    runScope,
    successFilter,
  ]);

  useEffect(() => {
    void fetchRuns();
  }, [fetchRuns]);

  useEffect(() => {
    if (!runsReady) return;
    void fetchTraces();
  }, [runsReady, fetchTraces]);

  const groupedForAllView = useMemo(() => mergeConsecutiveRuns(traces), [traces]);

  const filteredRuns = useMemo(() => {
    const q = runSearch.trim().toLowerCase();
    if (!q) return runs;
    return runs.filter(
      (r) =>
        String(r.id).includes(q)
        || r.name.toLowerCase().includes(q)
        || String(r.description || '').toLowerCase().includes(q)
        || r.status.toLowerCase().includes(q)
        || formatWhen(r.startedAt).toLowerCase().includes(q),
    );
  }, [runs, runSearch]);

  useEffect(() => {
    if (runPickerOpen) {
      const id = window.requestAnimationFrame(() => runSearchInputRef.current?.focus());
      return () => window.cancelAnimationFrame(id);
    }
    return undefined;
  }, [runPickerOpen]);

  const triggerSummary = useMemo(() => {
    if (!runsReady) {
      return { kicker: 'Test run', title: 'Loading…', subtitle: undefined as string | undefined };
    }
    if (runScope === 'all') {
      return {
        kicker: 'View',
        title: 'All traces · grouped by run',
        subtitle: 'Shows every saved result across runs on each page.',
      };
    }
    if (runScope === 'latest') {
      const r = runs[0];
      if (!r) {
        return { kicker: 'Latest', title: 'No runs yet', subtitle: undefined as string | undefined };
      }
      return {
        kicker: 'Latest run',
        title: `#${r.id} · ${formatWhen(r.startedAt)} · ${r.status}`,
        subtitle: r.name,
      };
    }
    const r = runs.find((x) => x.id === runScope);
    if (!r) {
      return {
        kicker: 'Run',
        title: `#${runScope} (refresh if missing)`,
        subtitle: undefined as string | undefined,
      };
    }
    return {
      kicker: `Run #${r.id}`,
      title: `${formatWhen(r.startedAt)} · ${r.status}`,
      subtitle: r.name,
    };
  }, [runScope, runs, runsReady]);

  const pickRunScope = (next: RunScope) => {
    setOffset(0);
    setRunScope(next);
    setRunPickerOpen(false);
    setRunSearch('');
  };

  const toggleRow = async (trace: TestTrace, index: number) => {
    const id = rowKey(trace, index);
    if (expandedRow === id) {
      setExpandedRow(null);
      return;
    }
    setExpandedRow(id);

    const rid = trace.resultId;
    if (rid == null) return;
    const needsBody = !trace.prompt?.length && !trace.response?.length;
    if (!needsBody) return;

    setLoadingDetailId(rid);
    try {
      const full = await api.getTestTraceByResultId(rid);
      setTraces((prev) =>
        prev.map((t) => (t.resultId === full.resultId ? { ...t, ...full } : t)),
      );
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDetailId((cur) => (cur === rid ? null : cur));
    }
  };

  const pipelineLabel = (t: TestTrace) => t.pipelineConfidence ?? t.pipelineConfidencePct;

  const passRate = (run: TestRunListItem) => {
    const n = run.totalTests;
    if (!n) return null;
    return ((run.passedTests / n) * 100).toFixed(1);
  };

  const refreshAll = async () => {
    try {
      const list = await api.getTestRuns(150);
      runsRef.current = list;
      setRuns(list);
    } catch (e) {
      console.error(e);
    } finally {
      setRunsReady(true);
    }
    await fetchTraces();
  };

  const tableColCount = 6;

  return (
    <motion.div
      className="mx-auto max-w-7xl space-y-6 p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Test Traces</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Browse results by <strong className="font-medium text-foreground">test run</strong> (batch / stress
            sessions share one run ID) or open <strong className="font-medium text-foreground">all traces</strong> with
            runs grouped on each page.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-muted/20 px-4 py-4 md:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Layers size={14} className="text-primary" />
                Test run
              </div>
              <Popover open={runPickerOpen} onOpenChange={setRunPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!runsReady}
                    className="relative h-auto min-h-11 w-full max-w-xl justify-start gap-1 px-3 py-2 pr-11 text-left font-normal"
                    aria-expanded={runPickerOpen}
                    aria-haspopup="dialog"
                  >
                    <div className="min-w-0 flex flex-col gap-0.5 text-left leading-snug">
                      <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                        {triggerSummary.kicker}
                      </span>
                      <span className="line-clamp-2 text-sm font-medium text-foreground">
                        {triggerSummary.title}
                      </span>
                      {triggerSummary.subtitle && (
                        <span className="line-clamp-2 text-xs text-muted-foreground">{triggerSummary.subtitle}</span>
                      )}
                    </div>
                    <ChevronDown size={18} className="pointer-events-none absolute right-3 top-2.5 shrink-0 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  collisionPadding={12}
                  className="w-[calc(100vw-2rem)] max-w-xl origin-top-left overflow-hidden border-border p-0 sm:w-[34rem]"
                >
                  <div className="flex max-h-[min(26rem,calc(100dvh-7rem))] flex-col">
                    <div className="shrink-0 border-b border-border p-2">
                      <Input
                        ref={runSearchInputRef}
                        placeholder="Filter by ID, status, date, or name…"
                        value={runSearch}
                        onChange={(e) => setRunSearch(e.target.value)}
                        className="h-9"
                        autoComplete="off"
                      />
                    </div>
                    <div
                      className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5"
                      aria-label="Choose test run source"
                    >
                      <div className="space-y-1">
                        <button
                          type="button"
                          disabled={runs.length === 0}
                          onClick={() => pickRunScope('latest')}
                          className={cn(
                            'flex w-full flex-col rounded-md px-2.5 py-2 text-left text-sm outline-none ring-offset-background transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
                            runScope === 'latest' && 'bg-accent text-accent-foreground',
                            runs.length === 0 && 'pointer-events-none opacity-50',
                          )}
                        >
                          <span className="font-semibold text-foreground">Latest run</span>
                          <span className="mt-0.5 text-xs text-muted-foreground">
                            {runs[0]
                              ? `Run #${runs[0].id} — ${formatWhen(runs[0].startedAt)} — ${runs[0].status}`
                              : 'No runs in database'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => pickRunScope('all')}
                          className={cn(
                            'flex w-full flex-col rounded-md px-2.5 py-2 text-left text-sm outline-none ring-offset-background transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
                            runScope === 'all' && 'bg-accent text-accent-foreground',
                          )}
                        >
                          <span className="font-semibold text-foreground">All traces</span>
                          <span className="mt-0.5 text-xs text-muted-foreground">
                            Mixed list with run headers · scroll the table pages for more
                          </span>
                        </button>

                        <div className="px-2 pt-2 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                          By ID ({filteredRuns.length}
                          {runSearch.trim() ? ` of ${runs.length}` : ''})
                        </div>

                        {filteredRuns.length === 0 && (
                          <div className="px-3 py-6 text-center text-sm text-muted-foreground">No runs match your filter.</div>
                        )}
                        <div className="space-y-0.5">
                          {filteredRuns.map((r) => (
                            <button
                              type="button"
                              key={r.id}
                              onClick={() => pickRunScope(r.id)}
                              className={cn(
                                'flex w-full flex-col gap-1 rounded-md px-2.5 py-2 text-left outline-none ring-offset-background transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
                                runScope === r.id && 'bg-accent text-accent-foreground',
                              )}
                            >
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="font-mono text-xs font-bold text-foreground">#{r.id}</span>
                                <span className={cn('rounded px-1.5 py-0 text-[0.65rem] font-semibold capitalize', runStatusTone(r.status))}>
                                  {r.status}
                                </span>
                                <span className="ml-auto shrink-0 text-[0.7rem] text-muted-foreground tabular-nums">
                                  {formatWhen(r.startedAt)}
                                </span>
                              </div>
                              <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">{r.name}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <button
              type="button"
              onClick={() => void refreshAll()}
              className="shrink-0 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Refresh
            </button>
          </div>

          {activeRun && isSingleRunView && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span
                className={cn(
                  'inline-flex items-center rounded-md border px-2 py-0.5 font-semibold capitalize',
                  runStatusTone(activeRun.status),
                )}
              >
                {activeRun.status}
              </span>
              <span className="tabular-nums">
                {activeRun.passedTests}/{activeRun.totalTests} defended
                {passRate(activeRun) != null ? ` · ${passRate(activeRun)}%` : ''}
              </span>
              <span aria-hidden className="text-border">
                ·
              </span>
              <span>Started {formatWhen(activeRun.startedAt)}</span>
              {activeRun.completedAt && (
                <>
                  <span aria-hidden className="text-border">
                    ·
                  </span>
                  <span>Finished {formatWhen(activeRun.completedAt)}</span>
                </>
              )}
            </div>
          )}
          {activeRun?.description && isSingleRunView && (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{activeRun.description}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-3 md:px-5">
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            value={successFilter}
            onChange={(e) => {
              setSuccessFilter(e.target.value as 'all' | 'true' | 'false');
              setOffset(0);
            }}
          >
            <option value="all">All outcomes</option>
            <option value="true">Defended only</option>
            <option value="false">Breached only</option>
          </select>
          <input
            type="text"
            value={providerFilter}
            onChange={(e) => {
              setProviderFilter(e.target.value);
              setOffset(0);
            }}
            placeholder="Provider contains…"
            className="w-40 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 md:w-44"
          />
          <input
            type="text"
            value={attackTypeFilter}
            onChange={(e) => {
              setAttackTypeFilter(e.target.value);
              setOffset(0);
            }}
            placeholder="Attack / case ID contains…"
            className="w-48 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 md:w-52"
          />
          {(providerFilter || attackTypeFilter || successFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSuccessFilter('all');
                setProviderFilter('');
                setAttackTypeFilter('');
                setOffset(0);
              }}
              className="text-xs text-muted-foreground underline transition-colors hover:text-foreground"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <AnimatePresence mode="wait">
          {!runsReady ? (
            <motion.div
              key="boot"
              role="status"
              aria-live="polite"
              className="flex justify-center p-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Loader2 size={32} className="animate-spin text-primary" />
            </motion.div>
          ) : loading ? (
            <motion.div
              key="loading"
              role="status"
              aria-live="polite"
              className="flex justify-center p-12 pl-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <Loader2 size={32} className="animate-spin text-primary" />
            </motion.div>
          ) : traces.length === 0 ? (
            <motion.div
              key="empty"
              className="p-12 text-center text-muted-foreground"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {runScope === 'latest' && runs.length === 0
                ? 'No test runs yet. Run a stress test to create traces.'
                : 'No traces match this view and filters.'}
            </motion.div>
          ) : (
            <motion.div
              key="table"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
            >
              <table className="w-full table-fixed border-collapse text-left text-sm">
                <colgroup>
                  <col style={{ width: '2.5rem' }} />
                  <col style={{ width: '4.5rem' }} />
                  <col />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '24%' }} />
                  <col style={{ width: '5.5rem' }} />
                </colgroup>
                <thead className="bg-muted/80 text-muted-foreground">
                  <tr>
                    <th className="px-2 py-3 pl-4 font-medium" aria-hidden />
                    <th className="px-2 py-3 font-medium">#</th>
                    <th className="px-2 py-3 font-medium">Attack</th>
                    <th className="px-2 py-3 font-medium">Provider</th>
                    <th className="px-2 py-3 font-medium">Outcome</th>
                    <th className="px-4 py-3 pr-4 text-right font-medium">ms</th>
                  </tr>
                </thead>
                {(() => {
                  let flatRow = -1;
                  const groups =
                    isSingleRunView && resolvedTestRunId != null
                      ? [{ testRunId: resolvedTestRunId, traces }]
                      : groupedForAllView.map((g) => ({ testRunId: g.testRunId, traces: g.traces }));
                  return groups.map((group) => (
                  <tbody key={`${group.testRunId}-${offset}`} className="divide-y divide-border">
                    {!isSingleRunView && (
                      <tr className="bg-muted/40">
                        <td colSpan={tableColCount} className="px-4 py-2.5">
                          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                            <span className="font-mono font-semibold text-foreground">Run #{group.testRunId}</span>
                            <span className="min-w-0 truncate text-muted-foreground" title={group.traces[0]?.runName}>
                              {group.traces[0]?.runName || 'Unnamed run'}
                            </span>
                            {group.traces[0]?.runStartedAt && (
                              <span className="text-muted-foreground">{formatWhen(group.traces[0].runStartedAt)}</span>
                            )}
                            <span className="rounded-md border border-border/80 bg-background px-1.5 py-0.5 font-medium text-muted-foreground tabular-nums">
                              {group.traces.length} on this page
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                    {group.traces.map((trace, indexWithinGroup) => {
                      flatRow += 1;
                      const rk = rowKey(trace, flatRow);
                      const isExpanded = expandedRow === rk;
                      const attackName = parseAttackName(trace.attackId || trace.testCaseId);
                      const iter = parseIterationIndex(trace.testCaseId);
                      const idxLabel =
                        iter ?? (isSingleRunView ? offset + flatRow + 1 : indexWithinGroup + 1);
                      const isLoadingDetail =
                        trace.resultId != null && loadingDetailId === trace.resultId;

                      return (
                        <Fragment key={rk}>
                          <tr
                            className={cn(
                              'cursor-pointer transition-colors hover:bg-muted/50',
                              isExpanded && 'bg-muted/30',
                            )}
                            onClick={() => void toggleRow(trace, flatRow)}
                          >
                            <td className="px-2 py-3 pl-4 text-muted-foreground">
                              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </td>
                            <td className="px-2 py-3 font-mono text-xs tabular-nums text-muted-foreground">
                              {idxLabel}
                            </td>
                            <td className="min-w-0 px-2 py-3">
                              <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                                <Zap size={10} className="flex-shrink-0" />
                                <span className="min-w-0 truncate">{attackName}</span>
                              </span>
                            </td>
                            <td className="min-w-0 px-2 py-3 capitalize">
                              <span className="block truncate" title={trace.llmProvider}>
                                {trace.llmProvider}
                              </span>
                            </td>
                            <td className="min-w-0 px-2 py-3">
                              <span
                                className={cn(
                                  'flex min-w-0 items-center gap-1.5 truncate font-medium',
                                  trace.success ? 'text-success' : 'text-destructive',
                                )}
                                title={
                                  trace.success
                                    ? `Defended${pipelineLabel(trace) != null ? ` (${pipelineLabel(trace)}%)` : ''}`
                                    : `Breached${pipelineLabel(trace) != null ? ` (${pipelineLabel(trace)}%)` : ''}`
                                }
                              >
                                {trace.success ? (
                                  <span className="h-2 w-2 rounded-full bg-success" />
                                ) : (
                                  <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
                                )}
                                {trace.success ? 'Defended' : 'Breached'}
                                {pipelineLabel(trace) !== undefined && (
                                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                                    ({pipelineLabel(trace)}%)
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="px-4 py-3 pr-4 text-right font-mono text-xs tabular-nums text-muted-foreground">
                              {trace.executionTimeMs}
                            </td>
                          </tr>
                          <AnimatePresence initial={false}>
                            {isExpanded && (
                              <tr className="bg-muted/20">
                                <td colSpan={tableColCount} className="p-0">
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                                    style={{ overflow: 'hidden' }}
                                  >
                                    <div className="space-y-4 p-5">
                                      <div className="flex flex-wrap items-center gap-3">
                                        <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
                                          <Zap size={12} className="text-amber-400" />
                                          <span className="text-muted-foreground">Attack:</span>
                                          <span className="font-semibold text-foreground">{attackName}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
                                          <span className="text-muted-foreground">Run:</span>
                                          <span className="font-mono font-semibold text-foreground">
                                            #{trace.testRunId}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
                                          <span className="text-muted-foreground">Provider:</span>
                                          <span className="font-semibold capitalize text-foreground">
                                            {trace.llmProvider}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
                                          {trace.success ? (
                                            <CheckCircle size={12} className="text-green-400" />
                                          ) : (
                                            <XCircle size={12} className="text-destructive" />
                                          )}
                                          <span
                                            className={cn(
                                              'font-semibold',
                                              trace.success ? 'text-green-400' : 'text-destructive',
                                            )}
                                          >
                                            {trace.success ? 'Defended' : 'Breached'}
                                          </span>
                                        </div>
                                        {pipelineLabel(trace) !== undefined && (
                                          <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
                                            <Shield size={12} className="text-primary" />
                                            <span className="text-muted-foreground">Confidence:</span>
                                            <span className="font-semibold text-foreground">
                                              {pipelineLabel(trace)}%
                                            </span>
                                          </div>
                                        )}
                                        <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
                                          <Clock size={12} className="text-muted-foreground" />
                                          <span className="font-semibold text-foreground">
                                            {trace.executionTimeMs}ms
                                          </span>
                                        </div>
                                      </div>

                                      {isLoadingDetail && (
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                          Loading prompt and response…
                                        </div>
                                      )}

                                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                                        <div className="overflow-hidden rounded-lg border border-border bg-background">
                                          <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
                                            <FileText size={14} className="text-primary" />
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                              Prompt (Excerpt)
                                            </h4>
                                          </div>
                                          <div className="p-4">
                                            <pre className="scrollbar-thin max-h-48 w-full overflow-y-auto break-all font-mono text-[11px] leading-relaxed text-foreground/90 whitespace-pre-wrap">
                                              {isLoadingDetail ? '…' : trace.prompt || '(No prompt text)'}
                                            </pre>
                                          </div>
                                        </div>
                                        <div className="overflow-hidden rounded-lg border border-border bg-background">
                                          <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
                                            <Shield size={14} className="text-green-400" />
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                              Defense State
                                            </h4>
                                          </div>
                                          <div className="p-4">
                                            <pre className="scrollbar-thin max-h-48 w-full overflow-y-auto break-all font-mono text-[11px] leading-relaxed text-primary whitespace-pre-wrap">
                                              {trace.defenseState
                                                ? JSON.stringify(trace.defenseState, null, 2)
                                                : 'No defense attached'}
                                            </pre>
                                          </div>
                                        </div>
                                      </div>
                                      <div className="overflow-hidden rounded-lg border border-border bg-background">
                                        <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
                                          <FileText size={14} className="text-amber-400" />
                                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                            Raw Response
                                          </h4>
                                        </div>
                                        <div className="p-4">
                                          <pre className="scrollbar-thin max-h-64 w-full overflow-y-auto break-all font-mono text-[11px] leading-relaxed text-foreground/90 whitespace-pre-wrap">
                                            {isLoadingDetail ? '…' : trace.response || '(No response text)'}
                                          </pre>
                                        </div>
                                      </div>
                                    </div>
                                  </motion.div>
                                </td>
                              </tr>
                            )}
                          </AnimatePresence>
                        </Fragment>
                      );
                    })}
                  </tbody>
                  ));
                })()}
              </table>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div>
          Showing {total === 0 ? 0 : offset + 1} to {Math.min(offset + limit, total)} of {total} result
          {total === 1 ? '' : 's'}
          {resolvedTestRunId != null && (
            <span className="ml-1 text-muted-foreground/80">in run #{resolvedTestRunId}</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={offset === 0}
            onClick={() => setOffset((o) => Math.max(0, o - limit))}
            className="rounded border border-border bg-card px-3 py-1 text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            Prev
          </button>
          <button
            type="button"
            disabled={offset + limit >= total}
            onClick={() => setOffset((o) => o + limit)}
            className="rounded border border-border bg-card px-3 py-1 text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </motion.div>
  );
}
