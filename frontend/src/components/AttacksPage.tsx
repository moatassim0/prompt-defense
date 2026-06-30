import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Zap,
  X,
  Plus,
  Loader2,
  AlertTriangle,
  Info,
  Library,
  CheckCircle2,
  Bug,
  Eye,
  Trash2,
  ShieldAlert,
  Target,
  Search,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Attack } from '../../../shared/types';
import ConfirmModal from './ConfirmModal';
import { cn } from '@/lib/utils';
import { filterAdversarialAttacks } from '@/lib/attack-filters';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { PageHeader, PageHeaderStat } from './ui/page-header';
import { motion, AnimatePresence } from 'motion/react';

interface AttacksPageProps {
  attacks: Attack[];
  isLoading?: boolean;
  onCreateAttack?: (data: {
    name: string;
    description: string;
    injectionText: string;
    category: string;
    tier: string;
    howItWorks?: string;
    mechanism?: string;
    impact?: string;
    example?: string;
  }) => Promise<void>;
  onDeleteAttack?: (attackId: string) => Promise<void>;
}

const SEVERITY_MAP: Record<string, string> = {
  override: 'critical',
  jailbreak: 'high',
  leak: 'medium',
  refuse: 'low',
  obfuscation: 'high',
  indirect: 'critical',
  escalation: 'critical',
  baseline: 'low',
  'Fabricated Context': 'high',
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-destructive text-white',
  high: 'border border-destructive text-destructive bg-transparent',
  medium: 'border border-amber-500 text-amber-500 bg-transparent',
  low: 'border border-muted-foreground text-muted-foreground bg-transparent',
};

const TIER_STYLES: Record<string, string> = {
  critical: 'bg-tier-critical/15 text-tier-critical border border-tier-critical/30',
  high: 'bg-tier-high/15 text-tier-high border border-tier-high/30',
  medium: 'bg-tier-medium/15 text-tier-medium border border-tier-medium/30',
  low: 'bg-tier-low/15 text-tier-low border border-tier-low/30',
  advanced: 'bg-tier-high/15 text-tier-high border border-tier-high/30',
  intermediate: 'bg-tier-medium/15 text-tier-medium border border-tier-medium/30',
  basic: 'bg-tier-low/15 text-tier-low border border-tier-low/30',
  none: 'bg-muted text-muted-foreground border border-border',
};

const CATEGORY_ICONS: Record<string, ReactNode> = {
  obfuscation: <ShieldAlert size={16} />,
  indirect: <Target size={16} />,
  escalation: <AlertTriangle size={16} />,
  override: <Zap size={16} />,
};

const TIER_ORDER: Record<string, number> = {
  basic: 0,
  intermediate: 1,
  advanced: 2,
  none: -1,
};

const CREATE_CATEGORIES = ['obfuscation', 'indirect', 'escalation', 'override', 'jailbreak', 'leak', 'refuse', 'baseline', 'Fabricated Context'] as const;

const createAttackSchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().min(10).max(500),
  injectionText: z.string().min(5, 'Payload too short'),
  category: z.string().min(1, 'Select a category'),
  tier: z.enum(['low', 'medium', 'high', 'critical']),
  howItWorks: z.string().optional(),
  mechanism: z.string().optional(),
  impact: z.string().optional(),
  example: z.string().optional(),
});

type CreateAttackFormValues = z.infer<typeof createAttackSchema>;

const CREATE_ATTACK_DEFAULTS: CreateAttackFormValues = {
  name: '',
  description: '',
  injectionText: '',
  category: 'obfuscation',
  tier: 'medium',
  howItWorks: '',
  mechanism: '',
  impact: '',
  example: '',
};

const FORM_TIER_TO_API: Record<CreateAttackFormValues['tier'], Attack['tier']> = {
  low: 'basic',
  medium: 'intermediate',
  high: 'advanced',
  critical: 'advanced',
};

function slugify(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return s || '—';
}

type SortKey = 'name' | 'tier' | 'category';

export default function AttacksPage({
  attacks,
  isLoading = false,
  onCreateAttack,
  onDeleteAttack,
}: AttacksPageProps) {
  const [selectedAttack, setSelectedAttack] = useState<Attack | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Attack | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('name');

  const catalogAttacks = useMemo(() => filterAdversarialAttacks(attacks), [attacks]);

  const sortedFilteredAttacks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = catalogAttacks;
    if (q) {
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.description && a.description.toLowerCase().includes(q)),
      );
    }
    const next = [...list];
    next.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'category') return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
      const ta = TIER_ORDER[a.tier] ?? 99;
      const tb = TIER_ORDER[b.tier] ?? 99;
      return ta - tb || a.name.localeCompare(b.name);
    });
    return next;
  }, [catalogAttacks, searchQuery, sortBy]);

  const createForm = useForm<CreateAttackFormValues>({
    resolver: zodResolver(createAttackSchema),
    defaultValues: CREATE_ATTACK_DEFAULTS,
    mode: 'onTouched',
  });

  const createName = createForm.watch('name');
  const { isSubmitting: isCreateSubmitting } = createForm.formState;

  useEffect(() => {
    if (!showCreate) return;
    createForm.reset(CREATE_ATTACK_DEFAULTS);
  }, [showCreate]);

  useEffect(() => {
    if (!selectedAttack && !showCreate) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setSelectedAttack(null);
      if (!isCreateSubmitting) setShowCreate(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [selectedAttack, showCreate, isCreateSubmitting]);

  async function onSubmitCreate(data: CreateAttackFormValues) {
    if (!onCreateAttack) return;
    setCreateSuccess(false);
    try {
      await onCreateAttack({
        name: data.name,
        description: data.description,
        injectionText: data.injectionText,
        category: data.category,
        tier: FORM_TIER_TO_API[data.tier],
        howItWorks: data.howItWorks || undefined,
        mechanism: data.mechanism || undefined,
        impact: data.impact || undefined,
        example: data.example || undefined,
      });
      setCreateSuccess(true);
      setTimeout(() => {
        createForm.reset(CREATE_ATTACK_DEFAULTS);
        setShowCreate(false);
        setCreateSuccess(false);
      }, 1200);
    } catch {
      /* toast handled upstream */
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget || !onDeleteAttack) return;
    try {
      await onDeleteAttack(deleteTarget.id);
    } catch {
      /* toast handled upstream */
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-6">
      <PageHeader
        icon={<Library size={14} />}
        badgeLabel="Attack Library"
        title="Review and manage attack vectors"
        description="Inspect registered attack vectors, understand their severity and mechanism, and create custom entries for targeted testing."
        stats={
          <>
            <PageHeaderStat label="Total" value={catalogAttacks.length} />
            <PageHeaderStat label="Built-in" value={catalogAttacks.filter((a) => a.isBuiltIn).length} />
            <PageHeaderStat label="Custom" value={catalogAttacks.filter((a) => !a.isBuiltIn).length} />
            <PageHeaderStat
              label="Critical"
              value={catalogAttacks.filter((a) => (SEVERITY_MAP[a.category] || 'low') === 'critical').length}
              valueClassName="text-destructive"
            />
          </>
        }
      />

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
                  This library contains adversarial attack vectors. Use the <strong>Stress Test</strong> page for benign baseline controls. Run vectors against your current defense posture from Stress Test or the Simulator.
                </p>
              </div>
              {onCreateAttack && (
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                  <Button onClick={() => setShowCreate(true)}>
                    <Plus size={16} />
                    Create attack
                  </Button>
                </motion.div>
              )}
            </div>

            {!isLoading && catalogAttacks.length > 0 && (
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative max-w-md flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name or description…"
                    className="pl-9"
                    aria-label="Search attacks"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Sort</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortKey)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Sort attacks"
                  >
                    <option value="name">Name</option>
                    <option value="tier">Tier</option>
                    <option value="category">Category</option>
                  </select>
                </div>
              </div>
            )}

            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div key="skeleton" exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-48 animate-pulse rounded-xl border border-border bg-muted/30"
                      />
                    ))}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="content"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.25 }}
                >
                  {catalogAttacks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-16">
                      <Bug className="h-10 w-10 text-muted-foreground" />
                      <p className="text-sm font-medium text-foreground">No attacks yet</p>
                      <p className="max-w-xs text-center text-xs text-muted-foreground">
                        Create your first attack vector to begin testing
                      </p>
                      {onCreateAttack && (
                        <Button onClick={() => setShowCreate(true)} variant="outline" size="sm">
                          <Plus size={16} />
                          Create Attack
                        </Button>
                      )}
                    </div>
                  ) : sortedFilteredAttacks.length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">
                      No attacks match your search. Try a different term.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {sortedFilteredAttacks.map((attack) => {
                        const severity = SEVERITY_MAP[attack.category] || 'low';
                        const Icon = CATEGORY_ICONS[attack.category] || <Zap size={16} />;
                        const tierKey = (attack.tier || 'basic').toLowerCase();
                        return (
                          <Card
                            key={attack.id}
                            className="group rounded-xl border border-border transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md"
                          >
                            <CardContent className="p-5">
                              <div className="mb-3 flex items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2.5">
                                  <span className="flex-shrink-0 text-muted-foreground transition-colors group-hover:text-primary">
                                    {Icon}
                                  </span>
                                  <span className="truncate text-sm font-semibold text-foreground">{attack.name}</span>
                                </div>
                                <span
                                  className={cn(
                                    'flex-shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase',
                                    SEVERITY_STYLES[severity],
                                  )}
                                >
                                  {severity}
                                </span>
                              </div>

                              <p className="mb-4 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                                {attack.description}
                              </p>

                              <div className="mb-4 flex flex-wrap items-center gap-2">
                                <span
                                  className={cn(
                                    'rounded border border-current/20 px-2 py-0.5 text-[0.6rem] font-semibold uppercase',
                                    TIER_STYLES[tierKey] || TIER_STYLES.basic,
                                  )}
                                >
                                  {attack.tier}
                                </span>
                                <span className="rounded bg-muted px-2 py-0.5 text-[0.6rem] text-muted-foreground">
                                  {attack.category}
                                </span>
                                {attack.isBuiltIn && (
                                  <span className="rounded bg-blue-500/10 px-2 py-0.5 text-[0.6rem] text-blue-400">
                                    Built-in
                                  </span>
                                )}
                              </div>

                              <div className="flex gap-2">
                                <Button
                                  type="button"
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
                                    type="button"
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
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </section>

      {selectedAttack && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in"
          onClick={() => setSelectedAttack(null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setSelectedAttack(null);
          }}
          tabIndex={-1}
        >
          <div
            className="bg-card border border-border rounded-2xl w-[min(100%,56rem)] max-w-4xl mx-4 max-h-[90vh] overflow-y-auto animate-slide-in cursor-auto text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border p-5 md:p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-red-600">
                  <Zap size={16} className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground md:text-xl">{selectedAttack.name}</h3>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <span className={cn('text-[0.65rem] font-semibold uppercase', TIER_STYLES[selectedAttack.tier] || TIER_STYLES.basic)}>
                      {selectedAttack.tier}
                    </span>
                    <span className="text-muted-foreground text-[0.65rem]">•</span>
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase',
                        SEVERITY_STYLES[SEVERITY_MAP[selectedAttack.category] || 'low'],
                      )}
                    >
                      {SEVERITY_MAP[selectedAttack.category] || 'low'}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAttack(null)}
                aria-label="Close attack details"
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-5 p-5 text-sm md:p-6 md:text-base">
              <p className="leading-relaxed text-muted-foreground">{selectedAttack.description}</p>
              {selectedAttack.howItWorks && (
                <div className="rounded-lg border border-border bg-muted/30 p-4 md:p-5">
                  <h4 className="mb-2 flex items-center gap-1.5 font-medium text-foreground">
                    <Info size={16} className="text-primary" /> How it Works
                  </h4>
                  <p className="text-sm leading-relaxed text-muted-foreground md:text-[15px]">{selectedAttack.howItWorks}</p>
                </div>
              )}
              {selectedAttack.mechanism && (
                <div>
                  <h4 className="mb-2 font-medium text-foreground">Mechanism</h4>
                  <p className="text-sm leading-relaxed text-muted-foreground md:text-[15px]">{selectedAttack.mechanism}</p>
                </div>
              )}
              {selectedAttack.impact && (
                <div className="rounded-lg border border-destructive/10 bg-destructive/5 p-4 md:p-5">
                  <h4 className="mb-2 flex items-center gap-1.5 font-medium text-destructive">
                    <AlertTriangle size={16} /> Impact
                  </h4>
                  <p className="text-sm leading-relaxed text-muted-foreground md:text-[15px]">{selectedAttack.impact}</p>
                </div>
              )}
              {selectedAttack.example && (
                <div>
                  <h4 className="mb-2 font-medium text-foreground">Example Payload</h4>
                  <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted p-4 text-xs text-foreground whitespace-pre-wrap md:text-sm">
                    {selectedAttack.example}
                  </pre>
                </div>
              )}
            </div>
            <div className="flex justify-end border-t border-border p-5 md:p-6">
              <Button onClick={() => setSelectedAttack(null)} variant="outline">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in transition-opacity"
          onClick={() => {
            if (!isCreateSubmitting && !createSuccess) setShowCreate(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !isCreateSubmitting && !createSuccess) setShowCreate(false);
          }}
          tabIndex={-1}
        >
          <div
            className="bg-card border border-border rounded-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto animate-slide-in cursor-auto text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border p-5">
              <h3 className="font-semibold text-foreground">Create Custom Attack</h3>
              <button
                type="button"
                aria-label="Close create attack form"
                onClick={() => {
                  if (!isCreateSubmitting && !createSuccess) setShowCreate(false);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(onSubmitCreate)} className="contents">
                <div className="space-y-3 p-5">
                  <FormField
                    control={createForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">
                          Name <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className="text-sm"
                            disabled={isCreateSubmitting || createSuccess}
                            placeholder="e.g. Unicode Smuggling Attack"
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">ID: {slugify(createName)}</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">
                          Short Explanation <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={2}
                            className="resize-y text-sm"
                            disabled={isCreateSubmitting || createSuccess}
                            placeholder="Briefly explain what this attack does and why it's dangerous"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="injectionText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">
                          Injection Payload <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={3}
                            className="resize-y font-mono text-sm"
                            disabled={isCreateSubmitting || createSuccess}
                            placeholder="The actual injection text that will be embedded in documents"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="howItWorks"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">How it Works</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={2}
                            className="resize-y text-sm"
                            disabled={isCreateSubmitting || createSuccess}
                            placeholder="Detailed explanation of the attack mechanism"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="impact"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Impact Assessment</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={2}
                            className="resize-y text-sm"
                            disabled={isCreateSubmitting || createSuccess}
                            placeholder="What damage could this attack cause if successful?"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={createForm.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Category</FormLabel>
                          <FormControl>
                            <select
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={isCreateSubmitting || createSuccess}
                              {...field}
                            >
                              {CREATE_CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="tier"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Tier</FormLabel>
                          <FormControl>
                            <select
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={isCreateSubmitting || createSuccess}
                              {...field}
                            >
                              <option value="low">low</option>
                              <option value="medium">medium</option>
                              <option value="high">high</option>
                              <option value="critical">critical</option>
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={createForm.control}
                    name="example"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Example Payload</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={2}
                            className="resize-y font-mono text-sm"
                            disabled={isCreateSubmitting || createSuccess}
                            placeholder="A sample of the attack in action"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex justify-end gap-2 border-t border-border p-5">
                  <Button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    variant="outline"
                    disabled={isCreateSubmitting || createSuccess}
                  >
                    Cancel
                  </Button>
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                    <Button type="submit" disabled={isCreateSubmitting || createSuccess}>
                      <AnimatePresence mode="wait">
                        {createSuccess ? (
                          <motion.div
                            key="success"
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            className="flex items-center"
                          >
                            <CheckCircle2 size={14} className="mr-2 text-safe" /> Created
                          </motion.div>
                        ) : isCreateSubmitting ? (
                          <motion.div
                            key="loading"
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            className="flex items-center"
                          >
                            <Loader2 size={14} className="mr-2 animate-spin" /> Creating…
                          </motion.div>
                        ) : (
                          <motion.div
                            key="idle"
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            className="flex items-center"
                          >
                            <Plus size={14} className="mr-2" /> Create Attack
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Button>
                  </motion.div>
                </div>
              </form>
            </Form>
          </div>
        </div>
      )}

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
