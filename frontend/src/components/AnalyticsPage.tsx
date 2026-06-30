import { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart3, Download, RefreshCw, Shield, Zap, Target, TrendingUp, FlaskConical, Activity, PieChart, Database } from 'lucide-react';
import { api } from '../services/api';
import { cn } from '@/lib/utils';

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

function AnimatedBar({ width, color = 'bg-primary/60', delay = 0, label }: { width: number; color?: string; delay?: number, label?: string }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setW(width), 50 + delay);
    return () => clearTimeout(timer);
  }, [width, delay]);

  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">{label}</span>
          <span className="text-xs font-bold text-foreground tabular-nums">{width.toFixed(1)}%</span>
        </div>
      )}
      <div className="relative h-3 rounded-full bg-muted/40 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-1000 ease-out', color)}
          style={{ width: `${w}%` }}
        />
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [defenseMetrics, setDefenseMetrics] = useState<DefenseMetric[]>([]);
  const [attackMetrics, setAttackMetrics] = useState<AttackMetric[]>([]);
  const [providerMetrics, setProviderMetrics] = useState<ProviderMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getAnalyticsSummary();
      setSummary(data.summary || null);
      setDefenseMetrics(data.byDefense || []);
      setAttackMetrics(data.byAttack || []);
      setProviderMetrics(data.byProvider || []);
    } catch {
      setError('Failed to load analytics. The database may be waking up — try again in a moment.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleExportCSV = useCallback(async () => {
    try {
      const blob = await api.exportAnalyticsCSV();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  }, []);

  const statCards = useMemo(() => {
    if (!summary) return [];
    return [
      { label: 'Total Test Runs', value: summary.total_test_runs, icon: FlaskConical, color: 'text-violet-500', bg: 'bg-violet-500/10' },
      { label: 'Tests Executed', value: summary.total_tests_executed, icon: Target, color: 'text-blue-500', bg: 'bg-blue-500/10' },
      { label: 'Defense Efficacy', value: pct(summary.avg_defense_effectiveness), icon: Shield, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
      { label: 'Avg F1 Score', value: pct(summary.avg_f1_score), icon: TrendingUp, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    ];
  }, [summary]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center animate-pulse">
          <Activity size={32} className="text-primary animate-bounce shadow-primary/20" />
        </div>
        <p className="text-muted-foreground text-sm font-medium animate-pulse">Aggregating analytical data…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] text-center gap-5">
        <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
          <Database size={32} className="text-destructive" />
        </div>
        <div>
          <h3 className="text-foreground font-semibold text-lg">Connection Error</h3>
          <p className="text-muted-foreground text-sm mt-1 mb-5">{error}</p>
          <button
            onClick={fetchData}
            className="flex mx-auto items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
          >
            <RefreshCw size={16} /> Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!summary || summary.total_test_runs === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] text-center gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-500">
      {/* Premium Header */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-card p-6 md:p-8">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl -ml-16 -mb-16 pointer-events-none" />
        
        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-lg shadow-primary/20">
              <BarChart3 size={24} className="text-white" />
            </div>
            <div>
              <h2 className="text-foreground text-2xl font-bold tracking-tight">Analytics Console</h2>
              <p className="text-muted-foreground text-sm mt-1">
                Real-time telemetry and effectiveness metrics across all stress tests.
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={fetchData}
              className="group flex items-center justify-center w-10 h-10 border border-border/80 bg-background rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all shadow-sm"
              title="Refresh Analytics"
              aria-label="Refresh Analytics"
            >
              <RefreshCw size={16} className="group-hover:rotate-180 transition-transform duration-500" />
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-all shadow-sm shadow-primary/20 hover:shadow-md hover:shadow-primary/30"
            >
              <Download size={16} className="animate-bounce-subtle" /> Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Hero Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <div key={i} className="bg-card border border-border/60 rounded-xl p-5 relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300 hover:shadow-lg">
            <div className={cn("absolute -right-4 -top-4 w-24 h-24 rounded-full blur-2xl opacity-50 group-hover:opacity-100 transition-opacity", stat.bg)} />
            <div className="relative z-10 flex items-start justify-between mb-4">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shadow-sm", stat.bg)}>
                <stat.icon size={18} className={stat.color} />
              </div>
            </div>
            <div className="relative z-10">
              <div className="text-foreground text-3xl font-black tracking-tight drop-shadow-sm">{stat.value}</div>
              <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mt-2">
                {stat.label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* --- charts section below uses the new AnimatedBar --- */}

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
                <AnimatedBar 
                  width={barWidth(d.avg_effectiveness)} 
                  color="bg-gradient-to-r from-teal-600/80 to-cyan-500/70" 
                  delay={i * 100} 
                  label={d.defense_id} 
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
                <AnimatedBar 
                  width={barWidth(a.avg_success_rate)} 
                  color="bg-gradient-to-r from-amber-600/80 to-orange-500/70" 
                  delay={i * 100} 
                  label={a.attack_type} 
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
                            isHighVulnerability ? 'text-destructive' : 'text-emerald-500',
                          )}>
                            {pct(pm.vulnerability_score)}
                          </span>
                          <div className="w-24 h-2 rounded-full bg-muted/50 overflow-hidden">
                            <div 
                              className={cn('h-full rounded-full', isHighVulnerability ? 'bg-destructive' : 'bg-emerald-500')} 
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
  );
}
