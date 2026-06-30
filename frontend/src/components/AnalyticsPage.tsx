import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Download, RefreshCw, Shield, Zap, Target, TrendingUp, FlaskConical, Activity, PieChart, Database, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';
import { api, isSuppressedAuth401Error } from '../services/api';
import { cn } from '@/lib/utils';
import { notify } from '@/lib/notify';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from './ui/page-header';
import { Button } from './ui/button';
import { KpiCard } from './analytics/kpi-card';
import { KpiSkeleton } from './ui/skeletons';

interface MetricsSummary {
  total_test_runs: number;
  total_tests_executed: number;
  avg_defense_effectiveness: number;
  avg_accuracy: number;
  avg_f1_score: number;
}

interface DefenseMetric {
  defense_id: string;
  avg_effectiveness: number;
  avg_accuracy: number;
  avg_f1: number;
  avg_tpr: number;
  avg_fpr: number;
  test_runs: number;
}

interface AttackMetric {
  attack_type: string;
  avg_success_rate: number;
  avg_defense_effectiveness: number;
  test_runs: number;
}

interface ProviderMetric {
  llm_provider: string;
  attack_type: string;
  vulnerability_score: number;
  avg_defense_effectiveness: number;
  test_count: number;
}

const pct = (val: number | undefined) => val ? `${(parseFloat(String(val)) * 100).toFixed(1)}%` : '—';
const barWidth = (val: number | undefined) => val ? Math.min(parseFloat(String(val)) * 100, 100) : 0;

function AnalyticsSpringBar({
  widthPct,
  index,
  label,
  variant,
}: {
  widthPct: number;
  index: number;
  label: string;
  variant: 'defense' | 'attack';
}) {
  const fillClass =
    variant === 'defense' ? 'bg-safe' : widthPct < 40 ? 'bg-warn' : 'bg-threat';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider truncate">{label}</span>
        <span className="text-xs font-bold text-foreground tabular-nums shrink-0">{widthPct.toFixed(1)}%</span>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted/40">
        <motion.div
          className={cn('h-full rounded-full', fillClass)}
          initial={{ width: '0%' }}
          animate={{ width: `${widthPct}%` }}
          transition={{ type: 'spring', stiffness: 300, damping: 28, delay: index * 0.05 }}
        />
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [defenseMetrics, setDefenseMetrics] = useState<DefenseMetric[]>([]);
  const [attackMetrics, setAttackMetrics] = useState<AttackMetric[]>([]);
  const [providerMetrics, setProviderMetrics] = useState<ProviderMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getAnalyticsSummary({ signal });
      setSummary(data.summary || null);
      setDefenseMetrics(data.byDefense || []);
      setAttackMetrics(data.byAttack || []);
      setProviderMetrics(data.byProvider || []);
    } catch (e) {
      if (isSuppressedAuth401Error(e)) return;
      if (axios.isCancel(e)) return;
      if (axios.isAxiosError(e) && e.code === 'ERR_CANCELED') return;
      if (signal?.aborted) return;
      setError('Failed to load analytics. The database may be waking up — try again in a moment.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const ac = new AbortController();
    void fetchData(ac.signal);
    return () => ac.abort();
  }, [fetchData, isAdmin]);

  const runExportCsv = useCallback(async () => {
    const blob = await api.exportAnalyticsCSV();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const onExportCsvClick = useCallback(() => {
    notify.promise(runExportCsv(), {
      loading: 'Preparing CSV export…',
      success: 'Analytics exported successfully',
      error: 'Failed to export analytics',
    });
  }, [runExportCsv]);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <Lock size={48} className="text-muted-foreground mb-4" />
        <h2 className="text-foreground text-lg font-semibold mb-1">Admin Only</h2>
        <p className="text-muted-foreground text-sm">Analytics is restricted to administrators.</p>
      </div>
    );
  }

  const contentNode = error ? (
    <div className="flex flex-col items-center justify-center min-h-[500px] text-center gap-5">
      <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
        <Database size={32} className="text-destructive" />
      </div>
      <div>
        <h3 className="text-foreground font-semibold text-lg">Connection Error</h3>
        <p className="text-muted-foreground text-sm mt-1 mb-5">{error}</p>
        <button
          onClick={() => { void fetchData(); }}
          className="flex mx-auto items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
        >
          <RefreshCw size={16} /> Retry Connection
        </button>
      </div>
    </div>
  ) : !summary || summary.total_test_runs === 0 ? (
    <div className="flex flex-col items-center justify-center min-h-[500px] text-center gap-5">
      <div className="w-24 h-24 rounded-full bg-primary/5 flex items-center justify-center shadow-inner">
        <PieChart size={40} className="text-primary/50" />
      </div>
      <div>
        <h2 className="text-foreground text-xl font-bold tracking-tight">No Telemetry Available</h2>
        <p className="text-muted-foreground text-sm max-w-sm mt-2 leading-relaxed">
          Run a simulated attack or stress test to generate analytics data for the dashboard.
        </p>
      </div>
    </div>
  ) : null;

  return (
    <AnimatePresence mode="wait">
      {loading ? (
        <motion.div
          key="skeleton"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="space-y-6 max-w-7xl mx-auto"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
          </div>
        </motion.div>
      ) : contentNode ? (
        <motion.div key="content-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
          {contentNode}
        </motion.div>
      ) : (
        <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Premium Header */}
      <PageHeader
        icon={<BarChart3 size={14} />}
        badgeLabel="Analytics Console"
        badgeClassName="border-blue-500/20 bg-blue-500/10 text-blue-400"
        title="Real-time telemetry and effectiveness metrics across all stress tests"
        description=""
        actions={
          <>
            <button
              onClick={() => { void fetchData(); }}
              className="group flex items-center justify-center w-10 h-10 border border-border/80 bg-background rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all shadow-sm"
              title="Refresh Analytics"
              aria-label="Refresh Analytics"
            >
              <RefreshCw size={16} className="group-hover:rotate-180 transition-transform duration-500" />
            </button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onExportCsvClick}
              title="Export analytics as CSV"
              aria-label="Export analytics as CSV"
            >
              <Download size={16} />
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 mb-8 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total Test Runs"
          value={summary!.total_test_runs}
          icon={<FlaskConical size={18} className="text-violet-500" />}
        />
        <KpiCard
          title="Defense Efficacy %"
          value={pct(summary!.avg_defense_effectiveness)}
          icon={<Shield size={18} className="text-emerald-500" />}
        />
        <KpiCard
          title="Avg F1 Score %"
          value={pct(summary!.avg_f1_score)}
          icon={<TrendingUp size={18} className="text-amber-500" />}
        />
        <KpiCard
          title="Tests Executed"
          value={summary!.total_tests_executed}
          icon={<Target size={18} className="text-blue-500" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Defense Effectiveness Chart */}
        <div className="bg-card border border-border/60 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-full bg-teal-500/10 flex items-center justify-center">
              <Shield size={14} className="text-teal-400" />
            </div>
            <h3 className="text-foreground text-base font-bold tracking-tight">Defense Mechanism Efficacy</h3>
          </div>
          <div className="space-y-4">
            {defenseMetrics.map((d, i) => (
              <div key={d.defense_id}>
                <AnalyticsSpringBar
                  widthPct={barWidth(d.avg_effectiveness)}
                  index={i}
                  label={d.defense_id}
                  variant="defense"
                />
              </div>
            ))}
            {defenseMetrics.length === 0 && (
              <div className="py-8 text-center border border-dashed border-border/60 rounded-lg bg-muted/30">
                <p className="text-muted-foreground text-sm">No defense telemetry available.</p>
              </div>
            )}
          </div>
        </div>

        {/* Attack Success Rates Chart */}
        <div className="bg-card border border-border/60 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center">
              <Zap size={14} className="text-amber-400" />
            </div>
            <h3 className="text-foreground text-base font-bold tracking-tight">Attack Vector Success Rates</h3>
          </div>
          <div className="space-y-4">
            {attackMetrics.map((a, i) => (
              <div key={a.attack_type}>
                <AnalyticsSpringBar
                  widthPct={barWidth(a.avg_success_rate)}
                  index={i}
                  label={a.attack_type}
                  variant="attack"
                />
              </div>
            ))}
            {attackMetrics.length === 0 && (
              <div className="py-8 text-center border border-dashed border-border/60 rounded-lg bg-muted/30">
                <p className="text-muted-foreground text-sm">No attack telemetry available.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Provider Metrics Table */}
      {providerMetrics.length > 0 && (
        <div className="bg-card border border-border/60 rounded-xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-border/40 bg-muted/10 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
              <Activity size={14} className="text-blue-500" />
            </div>
            <h3 className="text-foreground text-base font-bold tracking-tight">Provider Vulnerability Matrix</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/30">
                <tr>
                  {['LLM Provider', 'Identified Vector', 'Vulnerability Index', 'Mitigation Rate', 'Sample Size'].map((h) => (
                    <th key={h} className="px-6 py-4 text-muted-foreground font-semibold text-xs uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {providerMetrics.map((pm, i) => {
                  const vulnWidth = barWidth(pm.vulnerability_score);
                  const isHighVulnerability = vulnWidth > 50;
                  return (
                    <tr key={i} className="hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-4 font-bold text-foreground capitalize">
                        {pm.llm_provider}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded bg-muted/50 text-xs font-semibold font-mono border border-border/50 shadow-sm capitalize">
                          {pm.attack_type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className={cn(
                            'text-xs font-black w-12',
                            isHighVulnerability ? 'text-destructive' : 'text-safe',
                          )}>
                            {pct(pm.vulnerability_score)}
                          </span>
                          <div className="w-24 h-2 rounded-full bg-muted/50 overflow-hidden">
                            <div 
                              className={cn('h-full rounded-full', isHighVulnerability ? 'bg-destructive' : 'bg-safe')} 
                              style={{ width: `${vulnWidth}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-foreground font-semibold">{pct(pm.avg_defense_effectiveness)}</span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground font-medium flex items-center gap-2">
                        <Target size={14} className="opacity-50" /> {pm.test_count} runs
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
