import { useEffect, useState } from 'react';
import { Zap, Eye, X, Plus, Trash2, Loader2, AlertTriangle, ShieldAlert, Target, Info, Library } from 'lucide-react';
import { Attack } from '../../../shared/types';
import ConfirmModal from './ConfirmModal';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';

interface AttacksPageProps {
  attacks: Attack[];
  onCreateAttack?: (data: {
    name: string; description: string; injectionText: string;
    category: string; tier: string;
    howItWorks?: string; mechanism?: string; impact?: string; example?: string;
  }) => Promise<void>;
  onDeleteAttack?: (attackId: string) => Promise<void>;
}

const SEVERITY_MAP: Record<string, string> = {
  override: 'critical', jailbreak: 'high', leak: 'medium', refuse: 'low',
  obfuscation: 'high', indirect: 'critical', escalation: 'critical',
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-destructive text-white',
  high: 'border border-destructive text-destructive bg-transparent',
  medium: 'border border-amber-500 text-amber-500 bg-transparent',
  low: 'border border-muted-foreground text-muted-foreground bg-transparent',
};

const TIER_STYLES: Record<string, string> = {
  basic: 'text-green-400',
  intermediate: 'text-amber-400',
  advanced: 'text-red-400',
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  obfuscation: <ShieldAlert size={16} />,
  indirect: <Target size={16} />,
  escalation: <AlertTriangle size={16} />,
  override: <Zap size={16} />,
};

const EMPTY_FORM = {
  name: '', description: '', injectionText: '', category: 'obfuscation',
  tier: 'intermediate', howItWorks: '', mechanism: '', impact: '', example: '',
};

export default function AttacksPage({
  attacks, onCreateAttack, onDeleteAttack,
}: AttacksPageProps) {
  const [selectedAttack, setSelectedAttack] = useState<Attack | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Attack | null>(null);

  useEffect(() => {
    if (!selectedAttack && !showCreate) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setSelectedAttack(null);
      setShowCreate(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [selectedAttack, showCreate]);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.injectionText.trim() || !onCreateAttack) return;
    setCreating(true);
    try {
      await onCreateAttack({
        name: form.name,
        description: form.description,
        injectionText: form.injectionText,
        category: form.category,
        tier: form.tier,
        howItWorks: form.howItWorks || undefined,
        mechanism: form.mechanism || undefined,
        impact: form.impact || undefined,
        example: form.example || undefined,
      });
      setForm(EMPTY_FORM);
      setShowCreate(false);
    } catch { /* toast handled upstream */ }
    finally { setCreating(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !onDeleteAttack) return;
    try { await onDeleteAttack(deleteTarget.id); }
    catch { /* toast handled upstream */ }
    finally { setDeleteTarget(null); }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-6">
      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              <Library size={14} />
              Attack Library
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Review and manage attack vectors</h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Inspect registered attack vectors, understand their severity and mechanism, and create custom entries for targeted testing.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Total</div>
              <div className="mt-1 text-sm font-medium text-foreground">{attacks.length}</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Built-in</div>
              <div className="mt-1 text-sm font-medium text-foreground">{attacks.filter((attack) => attack.isBuiltIn).length}</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Custom</div>
              <div className="mt-1 text-sm font-medium text-foreground">{attacks.filter((attack) => !attack.isBuiltIn).length}</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Critical</div>
              <div className="mt-1 text-sm font-medium text-destructive">{attacks.filter((attack) => (SEVERITY_MAP[attack.category] || 'low') === 'critical').length}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Manage</p>
          <h3 className="text-lg font-semibold text-foreground">Curate the attack catalog</h3>
        </div>

        <Card className="rounded-2xl">
          <CardContent className="p-4 md:p-6">
            <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-start gap-3 rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3">
                <Info size={16} className="mt-0.5 flex-shrink-0 text-primary" />
                <p className="text-sm leading-relaxed text-muted-foreground">
                  This library contains all registered attack vectors. Use the <strong>Stress Test</strong> page to run them against your current defense posture.
                </p>
              </div>
              {onCreateAttack && (
                <Button onClick={() => setShowCreate(true)}>
                  <Plus size={16} />
                  Create attack
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {attacks.map((attack) => {
          const severity = SEVERITY_MAP[attack.category] || 'low';
          const Icon = CATEGORY_ICONS[attack.category] || <Zap size={16} />;
          return (
            <Card
              key={attack.id}
              className="group rounded-xl border border-border transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md"
            >
              <CardContent className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-muted-foreground transition-colors group-hover:text-primary">{Icon}</span>
                    <span className="text-sm font-semibold text-foreground">{attack.name}</span>
                  </div>
                  <span className={cn('rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase', SEVERITY_STYLES[severity])}>
                    {severity}
                  </span>
                </div>

                <p className="mb-4 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{attack.description}</p>

                <div className="mb-4 flex items-center gap-2">
                  <span className={cn('rounded border border-current/20 px-2 py-0.5 text-[0.6rem] font-semibold uppercase', TIER_STYLES[attack.tier] || 'text-muted-foreground')}>
                    {attack.tier}
                  </span>
                  <span className="rounded bg-muted px-2 py-0.5 text-[0.6rem] text-muted-foreground">{attack.category}</span>
                  {attack.isBuiltIn && (
                    <span className="rounded bg-blue-500/10 px-2 py-0.5 text-[0.6rem] text-blue-400">Built-in</span>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => setSelectedAttack(attack)}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                  >
                    <Eye size={12} />
                    View details
                  </Button>
                  {!attack.isBuiltIn && onDeleteAttack && (
                    <Button
                      onClick={() => setDeleteTarget(attack)}
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Delete ${attack.name}`}
                    >
                      <Trash2 size={12} />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Detail modal */}
      {selectedAttack && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in"
          onClick={() => setSelectedAttack(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setSelectedAttack(null); }}
          tabIndex={-1}
        >
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto animate-slide-in cursor-auto text-left" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
                  <Zap size={14} className="text-white" />
                </div>
                <div>
                  <h3 className="text-foreground font-semibold">{selectedAttack.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={cn('text-[0.6rem] font-semibold uppercase', TIER_STYLES[selectedAttack.tier])}>{selectedAttack.tier}</span>
                    <span className="text-muted-foreground text-[0.6rem]">•</span>
                    <span className={cn('text-[0.6rem] font-semibold uppercase px-1.5 rounded', SEVERITY_STYLES[SEVERITY_MAP[selectedAttack.category] || 'low'])}>
                      {SEVERITY_MAP[selectedAttack.category] || 'low'}
                    </span>
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedAttack(null)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4 text-sm">
              <p className="text-muted-foreground leading-relaxed">{selectedAttack.description}</p>
              {selectedAttack.howItWorks && (
                <div className="bg-muted/30 rounded-lg p-4 border border-border">
                  <h4 className="text-foreground font-medium mb-1.5 flex items-center gap-1.5"><Info size={14} className="text-primary" /> How it Works</h4>
                  <p className="text-muted-foreground text-xs leading-relaxed">{selectedAttack.howItWorks}</p>
                </div>
              )}
              {selectedAttack.mechanism && (
                <div>
                  <h4 className="text-foreground font-medium mb-1">Mechanism</h4>
                  <p className="text-muted-foreground text-xs leading-relaxed">{selectedAttack.mechanism}</p>
                </div>
              )}
              {selectedAttack.impact && (
                <div className="bg-destructive/5 rounded-lg p-4 border border-destructive/10">
                  <h4 className="text-destructive font-medium mb-1.5 flex items-center gap-1.5"><AlertTriangle size={14} /> Impact</h4>
                  <p className="text-muted-foreground text-xs leading-relaxed">{selectedAttack.impact}</p>
                </div>
              )}
              {selectedAttack.example && (
                <div>
                  <h4 className="text-foreground font-medium mb-1">Example Payload</h4>
                  <pre className="bg-muted p-3 rounded-md text-xs text-foreground whitespace-pre-wrap overflow-x-auto border border-border">{selectedAttack.example}</pre>
                </div>
              )}
            </div>
            <div className="flex justify-end p-5 border-t border-border">
              <Button onClick={() => setSelectedAttack(null)} variant="outline">Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in transition-opacity"
          onClick={() => setShowCreate(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') setShowCreate(false); }}
          tabIndex={-1}
        >
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto animate-slide-in cursor-auto text-left" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="text-foreground font-semibold">Create Custom Attack</h3>
              <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Name <span className="text-destructive">*</span></label>
                <input className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Unicode Smuggling Attack" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Short Explanation <span className="text-destructive">*</span></label>
                <textarea className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none resize-vertical" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Briefly explain what this attack does and why it's dangerous" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Injection Payload <span className="text-destructive">*</span></label>
                <textarea className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none resize-vertical font-mono" rows={3} value={form.injectionText} onChange={(e) => setForm({ ...form, injectionText: e.target.value })} placeholder="The actual injection text that will be embedded in documents" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">How it Works</label>
                <textarea className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none resize-vertical" rows={2} value={form.howItWorks} onChange={(e) => setForm({ ...form, howItWorks: e.target.value })} placeholder="Detailed explanation of the attack mechanism" />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Impact Assessment</label>
                <textarea className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none resize-vertical" rows={2} value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value })} placeholder="What damage could this attack cause if successful?" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Category</label>
                  <select className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {['obfuscation', 'indirect', 'escalation', 'override', 'jailbreak', 'leak', 'refuse'].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Tier</label>
                  <select className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground" value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>
                    {['basic', 'intermediate', 'advanced'].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Example Payload</label>
                <textarea className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none resize-vertical font-mono" rows={2} value={form.example} onChange={(e) => setForm({ ...form, example: e.target.value })} placeholder="A sample of the attack in action" />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-border">
              <Button onClick={() => setShowCreate(false)} variant="outline">Cancel</Button>
              <Button
                onClick={handleCreate}
                disabled={creating || !form.name.trim() || !form.injectionText.trim() || !form.description.trim()}
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {creating ? 'Creating…' : 'Create Attack'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete attack?"
        message={`"${deleteTarget?.name}" will be permanently removed.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
