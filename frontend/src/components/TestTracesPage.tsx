import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { TestTrace } from '../../../shared/types';
import { Loader2, ChevronDown, ChevronRight, FileText, Shield, Zap, Clock, CheckCircle, XCircle, ListFilter, RefreshCw, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

/** Extract a human-readable attack name from the stored attack id or legacy testCaseId. */
function parseAttackName(attackKey: string): string {
  // Convert kebab-case to Title Case
  return attackKey
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function normalizePercent(value?: number, max: number = 100): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Number(Math.min(max, Math.max(0, value)).toFixed(1));
}

function getEvaluatorConfidencePct(trace: TestTrace): number | undefined {
  const direct = normalizePercent(trace.evaluatorConfidencePct);
  if (direct !== undefined) return direct;
  const finalScore = trace.defenseState?.evaluationSummary?.finalScore;
  if (typeof finalScore === 'number' && Number.isFinite(finalScore)) {
    return normalizePercent(finalScore * 100);
  }
  return undefined;
}

function getPipelineConfidencePct(trace: TestTrace): number | undefined {
  const direct = normalizePercent(trace.pipelineConfidencePct);
  if (direct !== undefined) return direct;
  return normalizePercent(trace.pipelineConfidence ?? trace.defenseState?.pipelineResult?.pipelineConfidence);
}

export default function TestTracesPage() {
  const [traces, setTraces] = useState<TestTrace[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Filters
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [successFilter, setSuccessFilter] = useState<'all' | 'true' | 'false'>('all');
  const [providerFilter, setProviderFilter] = useState<string>('');
  const [attackTypeFilter, setAttackTypeFilter] = useState<string>('');
  const requestSeqRef = useRef(0);

  useEffect(() => {
    fetchTraces();
  }, [offset, successFilter, providerFilter, attackTypeFilter]);

  const fetchTraces = async () => {
    const requestId = ++requestSeqRef.current;
    setLoading(true);
    try {
      const filters: any = { limit, offset };
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
  };

  const toggleRow = (id: string) => {
    setExpandedRow((prev) => (prev === id ? null : id));
  };

  const showingStart = total === 0 ? 0 : offset + 1;
  const showingEnd = total === 0 ? 0 : Math.min(offset + limit, total);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-6 animate-in fade-in">
      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              <FileText size={14} />
              Trace Forensics
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">Test Traces</h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Drill into individual test executions, filter by provider or attack type, and inspect prompt, defense state, and raw model output in one aligned analysis view.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Visible</div>
              <div className="mt-1 text-sm font-medium text-foreground">{traces.length}</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Total</div>
              <div className="mt-1 text-sm font-medium text-foreground">{total}</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Offset</div>
              <div className="mt-1 text-sm font-medium text-foreground">{offset}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Analyze</p>
          <h3 className="text-lg font-semibold text-foreground">Filter the forensic dataset</h3>
        </div>

        <Card className="rounded-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <ListFilter size={16} className="text-primary" />
              Trace Toolbar
            </CardTitle>
            <CardDescription>Narrow the result set, refresh from the backend, or clear back to the full trace stream.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <select
                aria-label="Filter traces by result"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-card-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                value={successFilter}
                onChange={(e) => { setSuccessFilter(e.target.value as 'all' | 'true' | 'false'); setOffset(0); }}
              >
                <option value="all">All Results</option>
                <option value="true">Defended (Success)</option>
                <option value="false">Breached (Failed)</option>
              </select>

              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  aria-label="Filter traces by provider"
                  type="text"
                  value={providerFilter}
                  onChange={(e) => { setProviderFilter(e.target.value); setOffset(0); }}
                  placeholder="Filter by provider..."
                  className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm text-card-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  aria-label="Filter traces by attack type"
                  type="text"
                  value={attackTypeFilter}
                  onChange={(e) => { setAttackTypeFilter(e.target.value); setOffset(0); }}
                  placeholder="Filter by attack type..."
                  className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm text-card-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => fetchTraces()} size="sm">
                  <RefreshCw size={14} />
                  Refresh
                </Button>
                {(providerFilter || attackTypeFilter || successFilter !== 'all') && (
                  <Button
                    onClick={() => { setSuccessFilter('all'); setProviderFilter(''); setAttackTypeFilter(''); setOffset(0); }}
                    variant="ghost"
                    size="sm"
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="overflow-hidden rounded-2xl">
        {loading ? (
          <div className="flex justify-center p-12 pl-6"><Loader2 size={32} className="animate-spin text-primary" /></div>
        ) : traces.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">No traces found.</div>
        ) : (
          <>
            <div className="space-y-3 p-4 md:hidden">
            {traces.map((trace, index) => {
              const rowId = trace.testCaseId ? `${trace.testCaseId}-${index}` : `row-${index}`;
              const isExpanded = expandedRow === rowId;
              const attackName = parseAttackName(trace.attackId || trace.testCaseId);
              const evaluatorConfidencePct = getEvaluatorConfidencePct(trace);
              const pipelineConfidencePct = getPipelineConfidencePct(trace);
              return (
                <div key={rowId} className="overflow-hidden rounded-xl border border-border bg-background">
                  <button
                    className="w-full space-y-3 px-4 py-4 text-left"
                    onClick={() => toggleRow(rowId)}
                    aria-expanded={isExpanded}
                    aria-controls={`trace-card-${rowId}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">{trace.runName || `Run ${trace.testRunId}`}</div>
                        <div className="mt-1 text-xs capitalize text-muted-foreground">{trace.llmProvider}</div>
                      </div>
                      {isExpanded ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                        <Zap size={10} />
                        {attackName}
                      </span>
                      <span className={trace.success ? 'inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-0.5 text-xs font-medium text-success' : 'inline-flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive'}>
                        {trace.success ? 'Defended' : 'Breached'}
                      </span>
                      <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {trace.executionTimeMs}ms
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div id={`trace-card-${rowId}`} className="space-y-4 border-t border-border bg-muted/20 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {evaluatorConfidencePct !== undefined && (
                          <span className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground">
                            Evaluator {evaluatorConfidencePct}%
                          </span>
                        )}
                        {pipelineConfidencePct !== undefined && (
                          <span className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground">
                            Pipeline {pipelineConfidencePct}%
                          </span>
                        )}
                        <span className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground capitalize">
                          Provider {trace.llmProvider}
                        </span>
                      </div>
                      <div className="overflow-hidden rounded-xl border border-border bg-background">
                        <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
                          <FileText size={14} className="text-primary" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Prompt</h4>
                        </div>
                        <div className="p-4">
                          <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-foreground/90 scrollbar-thin">
                            {trace.prompt}
                          </pre>
                        </div>
                      </div>
                      <div className="overflow-hidden rounded-xl border border-border bg-background">
                        <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
                          <Shield size={14} className="text-green-400" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Defense State</h4>
                        </div>
                        <div className="p-4">
                          <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-primary scrollbar-thin">
                            {trace.defenseState ? JSON.stringify(trace.defenseState, null, 2) : 'No defense attached'}
                          </pre>
                        </div>
                      </div>
                      <div className="overflow-hidden rounded-xl border border-border bg-background">
                        <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
                          <FileText size={14} className="text-amber-400" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Raw Response</h4>
                        </div>
                        <div className="p-4">
                          <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-foreground/90 scrollbar-thin">
                            {trace.response}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="w-8 px-4 py-3 font-medium"></th>
                  <th className="px-4 py-3 font-medium">Test Run</th>
                  <th className="px-4 py-3 font-medium">Provider</th>
                  <th className="px-4 py-3 font-medium">Attack Type</th>
                  <th className="px-4 py-3 font-medium">Result</th>
                  <th className="px-4 py-3 text-right font-medium">Time (ms)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {traces.map((trace, index) => {
                  const rowId = trace.testCaseId ? `${trace.testCaseId}-${index}` : `row-${index}`;
                  const isExpanded = expandedRow === rowId;
                  const attackName = parseAttackName(trace.attackId || trace.testCaseId);
                  const evaluatorConfidencePct = getEvaluatorConfidencePct(trace);
                  const pipelineConfidencePct = getPipelineConfidencePct(trace);
                  return (
                    <React.Fragment key={rowId}>
                      <tr
                        className={cn(
                          'cursor-pointer transition-colors hover:bg-muted/50',
                          isExpanded && 'bg-muted/30',
                        )}
                        onClick={() => toggleRow(rowId)}
                      >
                        <td className="px-4 py-3 text-muted-foreground">
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </td>
                        <td className="px-4 py-3 font-medium">{trace.runName || `Run ${trace.testRunId}`}</td>
                        <td className="px-4 py-3 capitalize">{trace.llmProvider}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                            <Zap size={10} />
                            {attackName}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={trace.success ? 'flex items-center gap-1.5 font-medium text-success' : 'flex items-center gap-1.5 font-medium text-destructive'}>
                            {trace.success ? <span className="h-2 w-2 rounded-full bg-success"></span> : <span className="h-2 w-2 rounded-full bg-destructive animate-pulse"></span>}
                            {trace.success ? 'Defended' : 'Breached'}
                          </span>
                          {(evaluatorConfidencePct !== undefined || pipelineConfidencePct !== undefined) && (
                            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                              {evaluatorConfidencePct !== undefined && <span>Evaluator {evaluatorConfidencePct}%</span>}
                              {pipelineConfidencePct !== undefined && <span>Pipeline {pipelineConfidencePct}%</span>}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs">{trace.executionTimeMs}ms</td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-muted/20">
                          <td colSpan={6} className="p-0">
                            <div className="space-y-4 p-5 animate-in fade-in slide-in-from-top-2 duration-200">
                              <div className="flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
                                  <Zap size={12} className="text-amber-400" />
                                  <span className="text-muted-foreground">Attack:</span>
                                  <span className="font-semibold text-foreground">{attackName}</span>
                                </div>
                                <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
                                  <span className="text-muted-foreground">Provider:</span>
                                  <span className="font-semibold capitalize text-foreground">{trace.llmProvider}</span>
                                </div>
                                <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
                                  {trace.success
                                    ? <CheckCircle size={12} className="text-green-400" />
                                    : <XCircle size={12} className="text-destructive" />
                                  }
                                  <span className={cn('font-semibold', trace.success ? 'text-green-400' : 'text-destructive')}>
                                    {trace.success ? 'Defended' : 'Breached'}
                                  </span>
                                </div>
                                {evaluatorConfidencePct !== undefined && (
                                  <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
                                    <Shield size={12} className="text-primary" />
                                    <span className="text-muted-foreground">Evaluator:</span>
                                    <span className="font-semibold text-foreground">{evaluatorConfidencePct}%</span>
                                  </div>
                                )}
                                {pipelineConfidencePct !== undefined && (
                                  <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
                                    <Shield size={12} className="text-primary" />
                                    <span className="text-muted-foreground">Pipeline:</span>
                                    <span className="font-semibold text-foreground">{pipelineConfidencePct}%</span>
                                  </div>
                                )}
                                <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
                                  <Clock size={12} className="text-muted-foreground" />
                                  <span className="font-semibold text-foreground">{trace.executionTimeMs}ms</span>
                                </div>
                              </div>

                              <div className="grid gap-4 xl:grid-cols-2">
                                <div className="overflow-hidden rounded-xl border border-border bg-background">
                                  <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
                                    <FileText size={14} className="text-primary" />
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Prompt (Excerpt)</h4>
                                  </div>
                                  <div className="p-4">
                                    <pre className="max-h-56 w-full overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-foreground/90 scrollbar-thin">
                                      {trace.prompt}
                                    </pre>
                                  </div>
                                </div>
                                <div className="overflow-hidden rounded-xl border border-border bg-background">
                                  <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
                                    <Shield size={14} className="text-green-400" />
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Defense State</h4>
                                  </div>
                                  <div className="p-4">
                                    <pre className="max-h-56 w-full overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-primary scrollbar-thin">
                                      {trace.defenseState ? JSON.stringify(trace.defenseState, null, 2) : 'No defense attached'}
                                    </pre>
                                  </div>
                                </div>
                              </div>
                              <div className="overflow-hidden rounded-xl border border-border bg-background">
                                <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
                                  <FileText size={14} className="text-amber-400" />
                                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Raw Response</h4>
                                </div>
                                <div className="p-4">
                                  <pre className="max-h-72 w-full overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-foreground/90 scrollbar-thin">
                                    {trace.response}
                                  </pre>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>Showing {showingStart} to {showingEnd} of {total} traces</div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(o => Math.max(0, o - limit))}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + limit >= total}
            onClick={() => setOffset(o => o + limit)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
