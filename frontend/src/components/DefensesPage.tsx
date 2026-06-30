import { useEffect, useState } from 'react';
import { Shield, X, Lock, Search, Eye, Timer, Code, AlertCircle, ShieldCheck, Layers } from 'lucide-react';
import { Defense } from '../../../shared/types';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';

interface DefensesPageProps {
  defenses: Defense[];
  activeDefenses: string[];
  onToggle: (defenseId: string) => void;
}

const DEFENSE_ICONS: Record<string, React.ReactNode> = {
  'encoding-detector': <Code size={20} />,
  'canary-word': <Search size={20} />,
  'prompt-sandwiching': <Lock size={20} />,
  'llm-judge': <Eye size={20} />,
  'turn-tracker': <Timer size={20} />,
};

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  input: { label: 'Pre-LLM', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  output: { label: 'Post-LLM', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  session: { label: 'Session', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
};

export default function DefensesPage({ defenses, activeDefenses, onToggle }: DefensesPageProps) {
  const [selectedDefense, setSelectedDefense] = useState<Defense | null>(null);

  useEffect(() => {
    if (!selectedDefense) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedDefense(null);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [selectedDefense]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-6">
      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              <Layers size={14} />
              Defense Mechanisms
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Layer the protection pipeline</h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Review the available defenses, understand what each layer counters, and enable the combination that best fits your testing workflow.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Total</div>
              <div className="mt-1 text-sm font-medium text-foreground">{defenses.length}</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Active</div>
              <div className="mt-1 text-sm font-medium text-primary">{activeDefenses.length}</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Input</div>
              <div className="mt-1 text-sm font-medium text-foreground">{defenses.filter((defense) => defense.type === 'input').length}</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Other stages</div>
              <div className="mt-1 text-sm font-medium text-foreground">{defenses.filter((defense) => defense.type !== 'input').length}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Manage</p>
          <h3 className="text-lg font-semibold text-foreground">Enable the defenses you want active</h3>
        </div>

        <Card className="rounded-2xl">
          <CardContent className="space-y-4 p-4 md:p-6">
            <div className="flex items-start gap-3 rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3" role="status">
              <ShieldCheck size={16} className="mt-0.5 flex-shrink-0 text-primary" />
              <div className="text-sm leading-relaxed text-muted-foreground">
                {activeDefenses.length > 0
                  ? <span><strong className="text-primary">{activeDefenses.length}</strong> defense{activeDefenses.length !== 1 ? 's are' : ' is'} currently protecting your queries.</span>
                  : <span>No defenses are active right now. Enable multiple layers for defense-in-depth coverage.</span>}
              </div>
            </div>

            <div className="space-y-3">
        {defenses.map((defense) => {
          const isActive = activeDefenses.includes(defense.id);
          const icon = DEFENSE_ICONS[defense.id] || <Shield size={20} />;
          const typeInfo = TYPE_LABELS[defense.type] || TYPE_LABELS.input;

          return (
            <Card
              key={defense.id}
              className={cn(
                'rounded-xl border transition-all duration-200',
                isActive ? 'border-primary/20 bg-primary/5 shadow-sm' : 'border-border',
              )}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className={isActive ? 'text-primary' : 'text-muted-foreground'}>{icon}</span>
                      <span className="text-sm font-semibold text-foreground">{defense.name}</span>
                      <span className={cn('inline-flex items-center rounded px-2 py-0.5 text-[0.65rem] font-medium border', typeInfo.color)}>
                        {typeInfo.label}
                      </span>
                      {isActive && (
                        <span className="inline-flex items-center rounded bg-primary/10 px-2 py-0.5 text-[0.65rem] font-semibold text-primary">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{defense.description}</p>

                    {defense.countersAttacks && defense.countersAttacks.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-1.5">
                        {defense.countersAttacks.map((attackId) => (
                          <span key={attackId} className="inline-flex rounded border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-[0.6rem] font-medium text-destructive">
                            ↳ {attackId}
                          </span>
                        ))}
                      </div>
                    )}

                    <Button
                      onClick={() => setSelectedDefense(defense)}
                      variant="ghost"
                      size="sm"
                      className="px-0 text-primary hover:bg-transparent hover:text-primary/80"
                    >
                      Learn more
                    </Button>
                  </div>

                  <button
                    onClick={() => onToggle(defense.id)}
                    role="switch"
                    aria-checked={isActive}
                    aria-label={`${isActive ? 'Disable' : 'Enable'} ${defense.name}`}
                    className={cn(
                      'relative h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200',
                      isActive ? 'bg-primary' : 'bg-muted',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200',
                        isActive ? 'left-[22px]' : 'left-0.5',
                      )}
                    />
                  </button>
                </div>
              </CardContent>
            </Card>
          );
        })}
            </div>

            <div className="flex gap-3 rounded-2xl border border-border bg-muted/20 p-4">
              <AlertCircle size={20} className="mt-0.5 flex-shrink-0 text-primary" />
              <div>
                <h3 className="text-sm font-medium text-foreground mb-1">Defense strategy tip</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  The <strong>LLM-as-Judge</strong> acts as a broad safety net. Pair it with input-stage defenses for better coverage across multiple attack families.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Detail modal — uses the defense object's own fields */}
      {selectedDefense && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in"
          onClick={() => setSelectedDefense(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setSelectedDefense(null); }}
          tabIndex={-1}
        >
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto animate-slide-in cursor-auto text-left" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-primary">{DEFENSE_ICONS[selectedDefense.id] || <Shield size={18} />}</span>
                <h3 className="text-foreground font-semibold">{selectedDefense.name}</h3>
                {(() => {
                  const t = TYPE_LABELS[selectedDefense.type] || TYPE_LABELS.input;
                  return <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-[0.65rem] font-medium border', t.color)}>{t.label}</span>;
                })()}
              </div>
              <button onClick={() => setSelectedDefense(null)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4 text-sm">
              {selectedDefense.howItWorks && (
                <div>
                  <h4 className="text-foreground font-medium mb-1">How It Works</h4>
                  <p className="text-muted-foreground text-xs leading-relaxed">{selectedDefense.howItWorks}</p>
                </div>
              )}
              {selectedDefense.researchBasis && (
                <div>
                  <h4 className="text-foreground font-medium mb-1">Research Basis</h4>
                  <p className="text-muted-foreground text-xs leading-relaxed">{selectedDefense.researchBasis}</p>
                </div>
              )}
              {selectedDefense.countersAttacks && selectedDefense.countersAttacks.length > 0 && (
                <div>
                  <h4 className="text-foreground font-medium mb-1">Counters Attacks</h4>
                  <div className="flex flex-wrap gap-1">
                    {selectedDefense.countersAttacks.map((attackId) => (
                      <span key={attackId} className="inline-flex px-2 py-1 rounded text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20">
                        {attackId}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {selectedDefense.effectiveness && (
                <div>
                  <h4 className="text-foreground font-medium mb-1">Effectiveness</h4>
                  <p className="text-primary text-xs font-medium">{selectedDefense.effectiveness}</p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-border">
              <Button onClick={() => setSelectedDefense(null)} variant="outline">Close</Button>
              <Button
                onClick={() => { onToggle(selectedDefense.id); setSelectedDefense(null); }}
              >
                {activeDefenses.includes(selectedDefense.id) ? 'Disable' : 'Enable'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
