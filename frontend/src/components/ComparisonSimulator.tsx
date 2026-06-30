import { useState } from 'react';
import {
  Loader2,
  Shield,
  Zap,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Shuffle,
  Activity,
  Target,
  Terminal,
  Sparkles,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../services/api';
import { useToast } from './Toast';
import { Attack, Defense, Document, QueryResponse } from '../../../shared/types';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

interface ComparisonSimulatorProps {
  attacks: Attack[];
  defenses: Defense[];
  documents: Document[];
}

function calcSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const wordsA = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

export default function ComparisonSimulator({ attacks, defenses, documents }: ComparisonSimulatorProps) {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState('');
  const [promptError, setPromptError] = useState('');
  const [selectedAttacks, setSelectedAttacks] = useState<string[]>([]);
  const [selectedDefenses, setSelectedDefenses] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [useRandomPrompt, setUseRandomPrompt] = useState(false);
  const [loadingRandomPrompt, setLoadingRandomPrompt] = useState(false);
  const [results, setResults] = useState<{
    clean?: QueryResponse;
    attacked?: QueryResponse;
    defended?: QueryResponse;
  } | null>(null);

  const handleToggleAttack = (attackId: string) => {
    setSelectedAttacks((prev) =>
      prev.includes(attackId) ? prev.filter((id) => id !== attackId) : [...prev, attackId],
    );
  };
  
  const handleToggleDefense = (defenseId: string) => {
    setSelectedDefenses((prev) =>
      prev.includes(defenseId) ? prev.filter((id) => id !== defenseId) : [...prev, defenseId],
    );
  };

  const selectAllDefenses = () => setSelectedDefenses(defenses.map((d) => d.id));
  const deselectAllDefenses = () => setSelectedDefenses([]);

  const handleToggleRandomPrompt = async () => {
    const newValue = !useRandomPrompt;
    setUseRandomPrompt(newValue);
    if (newValue) {
      setLoadingRandomPrompt(true);
      try {
        const res = await api.getRandomPrompt();
        setPrompt(res.prompt);
        setPromptError('');
      } catch {
        toast.error('Failed to fetch random prompt from backend.');
        setUseRandomPrompt(false);
      } finally {
        setLoadingRandomPrompt(false);
      }
    }
  };

  const handleRefreshRandomPrompt = async () => {
    setLoadingRandomPrompt(true);
    try {
      const res = await api.getRandomPrompt();
      setPrompt(res.prompt);
      setPromptError('');
    } catch {
      toast.error('Failed to fetch random prompt.');
    } finally {
      setLoadingRandomPrompt(false);
    }
  };

  const handleRun = async () => {
    if (!prompt.trim()) {
      setPromptError('Please enter a payload or prompt.');
      return;
    }
    setPromptError('');
    setIsLoading(true);
    setResults(null);
    try {
      const response = await api.runComparison({
        prompt,
        documentIds: documents.map((d) => d.id),
        attackIds: selectedAttacks.length > 0 ? selectedAttacks : undefined,
        defenseIds: selectedDefenses.length > 0 ? selectedDefenses : undefined,
      });
      setResults(response);
    } catch {
      toast.error('Failed to execute simulation. Ensure backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  const isReadyToRun = selectedAttacks.length === 0 || (selectedAttacks.length > 0 && selectedDefenses.length > 0);

  // --- Telemetry Computation ---
  const activeAttackObjs = attacks.filter((a) => selectedAttacks.includes(a.id));
  const defenseState = results?.defended?.defenseState;
  const pipelineResult = defenseState?.pipelineResult;
  const verdicts = pipelineResult?.verdicts || [];
  
  const getStatusObj = () => {
    if (isLoading) return { label: 'SCANNING IN PROGRESS...', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
    if (!results) {
      if (selectedAttacks.length === 0) {
        return { label: 'SYSTEM STANDBY', color: 'text-muted-foreground bg-muted/20 border-border' };
      }
      if (selectedDefenses.length === 0) {
        return { label: 'SCENARIO NEEDS DEFENSES', color: 'text-warning bg-warning/10 border-warning/30' };
      }
      return { label: 'READY TO EXECUTE', color: 'text-info bg-info/10 border-info/30' };
    }
    if (selectedAttacks.length === 0) return { label: 'NORMAL OPERATIONS', color: 'text-info bg-info/10 border-info/30' };
    if (selectedAttacks.length > 0 && selectedDefenses.length === 0) return { label: 'SYSTEM COMPROMISED', color: 'text-destructive bg-destructive/10 border-destructive/30' };

    const isBlocked = defenseState?.flagged || pipelineResult?.allowed === false;
    if (isBlocked) {
      return { label: 'THREAT NEUTRALIZED', color: 'text-success bg-success/10 border-success/30' };
    }
    return { label: 'SYSTEM COMPROMISED', color: 'text-destructive bg-destructive/10 border-destructive/30' };
  };

  const statusObj = getStatusObj();
  
  // Threat Category String
  let threatCategoryText = '--';
  if (activeAttackObjs.length === 1) {
    threatCategoryText = activeAttackObjs[0].category?.replace(/_/g, ' ')?.toUpperCase() || 'UNKNOWN';
  } else if (activeAttackObjs.length > 1) {
    const uniqueCategories = Array.from(new Set(activeAttackObjs.map(a => a.category?.replace(/_/g, ' ')?.toUpperCase() || 'UNKNOWN')));
    if (uniqueCategories.length <= 2) {
      threatCategoryText = uniqueCategories.join(' + ');
    } else {
      threatCategoryText = `MULTIPLE (${activeAttackObjs.length} VECTORS)`;
    }
  }
  
  const integrityScore = results?.clean && results?.defended 
    ? Math.round(calcSimilarity(results.clean.response, results.defended.response) * 100)
    : null;
  const integrityText = integrityScore !== null ? `${integrityScore}%` : '--';

  const usedTokenCount = results?.defended?.tokenCount ?? results?.attacked?.tokenCount ?? results?.clean?.tokenCount;
  const selectedAttackNames = attacks.filter((attack) => selectedAttacks.includes(attack.id)).map((attack) => attack.name);
  const selectedDefenseNames = defenses.filter((defense) => selectedDefenses.includes(defense.id)).map((defense) => defense.name);

  return (
    <div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-6">
      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              <ShieldAlert size={14} />
              Simulator Workspace
            </div>
            <div>
              <div className="flex items-center gap-3">
                <ShieldAlert size={28} className="text-primary" />
                <h2 className="text-foreground text-2xl font-bold tracking-tight md:text-3xl">Threat Intel Center</h2>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Build an attack scenario, run it against the current pipeline, and inspect the protected output, breach behavior, and defense reasoning in one workspace.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Prompt</div>
              <div className="mt-1 text-sm font-medium text-foreground">{prompt.trim() ? 'Ready' : 'Empty'}</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Attacks</div>
              <div className="mt-1 text-sm font-medium text-foreground">{selectedAttacks.length || 0} selected</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Defenses</div>
              <div className="mt-1 text-sm font-medium text-foreground">{selectedDefenses.length || 0} active</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Documents</div>
              <div className="mt-1 text-sm font-medium text-foreground">{documents.length} attached</div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Setup</p>
          <h3 className="text-lg font-semibold text-foreground">Build the scenario before you run it</h3>
        </div>

        <Card className="rounded-2xl border-border/80 shadow-sm">
          <CardContent className="p-4 md:p-6">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)]">
              <Card className="border-border/70 shadow-none">
                <CardHeader className="space-y-3 pb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <FileText size={16} className="text-primary" />
                        Payload Composer
                      </CardTitle>
                      <CardDescription>
                        Enter a direct payload or pull a randomized prompt to simulate a live operator run.
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant={useRandomPrompt ? 'default' : 'outline'}
                        size="sm"
                        disabled={isLoading || loadingRandomPrompt}
                        onClick={handleToggleRandomPrompt}
                      >
                        {loadingRandomPrompt ? <Loader2 className="animate-spin" size={14} /> : <Shuffle size={14} />}
                        {useRandomPrompt ? 'Randomized' : 'Random prompt'}
                      </Button>
                      {useRandomPrompt && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isLoading || loadingRandomPrompt}
                          onClick={handleRefreshRandomPrompt}
                        >
                          Shuffle
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                      <Sparkles size={12} />
                      {useRandomPrompt ? 'Backend prompt source enabled' : 'Manual prompt mode'}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                      {documents.length === 0 ? 'No document context attached' : `${documents.length} document(s) included`}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <textarea
                    aria-label="Payload or prompt"
                    value={prompt}
                    onChange={(e) => {
                      setPrompt(e.target.value);
                      if (promptError) setPromptError('');
                      if (useRandomPrompt) setUseRandomPrompt(false);
                    }}
                    placeholder="Enter payload or prompt here..."
                    className={cn(
                      'min-h-[240px] w-full resize-y rounded-xl border bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors focus:ring-2 stylish-scrollbar',
                      promptError
                        ? 'border-destructive focus:border-destructive focus:ring-destructive/30'
                        : 'border-input focus:border-primary focus:ring-primary/30',
                    )}
                  />
                  {promptError ? (
                    <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                      <AlertTriangle size={14} />
                      {promptError}
                    </div>
                  ) : (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Keep the payload focused. The simulator will apply the selected attack vectors, then compare the defended response against the exposed system behavior.
                    </p>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card className="border-border/70 shadow-none">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Zap size={16} className="text-warning" />
                          Attack Vectors
                        </CardTitle>
                        <CardDescription>Select one or more attack strategies to apply to this run.</CardDescription>
                      </div>
                      <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
                        {selectedAttacks.length} selected
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="max-h-[min(42vh,24rem)] space-y-2 overflow-y-auto pr-1 stylish-scrollbar xl:max-h-none">
                      {attacks.map((a) => {
                        const active = selectedAttacks.includes(a.id);
                        return (
                          <button
                            key={a.id}
                            onClick={() => handleToggleAttack(a.id)}
                            className={cn(
                              'w-full rounded-xl border px-3 py-3 text-left transition-colors',
                              active
                                ? 'border-warning/30 bg-warning/10'
                                : 'border-border bg-background hover:border-warning/20 hover:bg-muted/40',
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className={cn('text-sm font-medium', active ? 'text-foreground' : 'text-foreground')}>
                                  {a.name}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {(a.category || 'unknown').replace(/_/g, ' ')}
                                </div>
                              </div>
                              {active && <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-warning" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/70 shadow-none">
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Shield size={16} className="text-success" />
                          Active Defenses
                        </CardTitle>
                        <CardDescription>
                          Choose how the pipeline should respond when a selected attack reaches the model.
                        </CardDescription>
                      </div>
                      {selectedAttacks.length > 0 && (
                        <div className="flex gap-2">
                          <Button type="button" variant="ghost" size="sm" onClick={selectAllDefenses}>
                            All
                          </Button>
                          <Button type="button" variant="ghost" size="sm" onClick={deselectAllDefenses}>
                            None
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {selectedAttacks.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-sm leading-relaxed text-muted-foreground">
                        Select at least one attack vector to activate defense configuration for this scenario.
                      </div>
                    ) : (
                      <div className="max-h-[min(42vh,24rem)] space-y-2 overflow-y-auto pr-1 stylish-scrollbar xl:max-h-none">
                        {defenses.map((d) => {
                          const active = selectedDefenses.includes(d.id);
                          return (
                            <button
                              key={d.id}
                              onClick={() => handleToggleDefense(d.id)}
                              className={cn(
                                'w-full rounded-xl border px-3 py-3 text-left transition-colors',
                                active
                                  ? 'border-success/30 bg-success/10'
                                  : 'border-border bg-background hover:border-success/20 hover:bg-muted/40',
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-foreground">{d.name}</div>
                                  <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{d.type}</div>
                                </div>
                                {active && <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-border/70 bg-muted/20 p-4 md:p-5">
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full bg-background px-3 py-1 text-xs font-medium text-foreground">
                  {selectedAttackNames.length > 0 ? `${selectedAttackNames.length} attack vector(s)` : 'No attack selected'}
                </span>
                <span className="inline-flex items-center rounded-full bg-background px-3 py-1 text-xs font-medium text-foreground">
                  {selectedDefenseNames.length > 0 ? `${selectedDefenseNames.length} defense(s)` : 'No defenses active'}
                </span>
                <span className="inline-flex items-center rounded-full bg-background px-3 py-1 text-xs font-medium text-foreground">
                  {documents.length > 0 ? `${documents.length} document(s) in context` : 'Synthetic context only'}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
                    isReadyToRun
                      ? 'bg-success/10 text-success'
                      : 'bg-warning/10 text-warning',
                  )}
                >
                  {isReadyToRun ? 'Ready to run' : 'Add a defense before running attacks'}
                </span>
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="max-w-2xl text-sm text-muted-foreground">
                  {selectedAttacks.length === 0
                    ? 'Running without attacks shows the baseline model behavior for the current prompt.'
                    : 'This run will compare breach behavior against the defended system so you can inspect both output quality and pipeline handling.'}
                </div>
                <div className="flex flex-col items-stretch gap-2 sm:flex-row">
                  {!isReadyToRun && (
                    <div className="flex items-center gap-2 rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
                      <AlertTriangle size={14} />
                      Activate at least one defense for attack runs.
                    </div>
                  )}
                  <Button onClick={handleRun} disabled={isLoading || !isReadyToRun} size="lg" className="min-w-[180px]">
                    {isLoading ? <Loader2 className="animate-spin" size={16} /> : <Activity size={16} />}
                    {isLoading ? 'Executing' : 'Run Simulation'}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Run And Observe</p>
          <h3 className="text-lg font-semibold text-foreground">Monitor the active scenario</h3>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.15fr)]">
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Zap size={14} className="text-warning" />
                Threat Category
              </div>
              <div className={cn('mt-3 text-xl font-bold font-mono', selectedAttacks.length > 0 ? 'text-warning' : 'text-muted-foreground')}>
                {threatCategoryText}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Terminal size={14} className="text-primary" />
                Token Context
              </div>
              <div className="mt-3 text-xl font-bold font-mono text-foreground">
                {usedTokenCount ? usedTokenCount.toLocaleString() : '--'}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Target size={14} className="text-primary" />
                Response Integrity
              </div>
              <div className="mt-3 flex items-baseline gap-2 text-xl font-bold font-mono text-foreground">
                {integrityText}
                {integrityScore !== null && (
                  <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">similarity</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className={cn('rounded-2xl border transition-colors', statusObj.color)}>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-80">
                <Activity size={14} />
                Run Status
              </div>
              <div className="mt-3 text-lg font-bold font-mono tracking-tight">{statusObj.label}</div>
              <p className="mt-2 text-sm opacity-80">
                {isLoading
                  ? 'The pipeline is processing the active prompt and collecting trace details.'
                  : results
                    ? 'Review the analysis tabs below to inspect the defended response and the triggered verdicts.'
                    : 'No run yet. Configure the scenario and execute a simulation to populate analysis.'}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-3 pb-6">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Analyze</p>
          <h3 className="text-lg font-semibold text-foreground">Inspect the protected output, breach path, and defense reasoning</h3>
        </div>

        {!results && !isLoading ? (
          <Card className="rounded-2xl border-dashed">
            <CardContent className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center">
              <Activity size={44} className="mb-4 text-muted-foreground/50" />
              <h4 className="text-lg font-semibold text-foreground">Awaiting simulation</h4>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
                Use the setup workbench above to craft a scenario, then run the simulator to compare the exposed model behavior against the defended pipeline.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="rounded-2xl">
            <CardContent className="p-4 md:p-6">
              <Tabs defaultValue="protected" className="space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <TabsList className="grid w-full grid-cols-3 md:w-auto">
                    <TabsTrigger value="protected">Protected Output</TabsTrigger>
                    <TabsTrigger value="breach">Breach Simulation</TabsTrigger>
                    <TabsTrigger value="trace">Defense Trace</TabsTrigger>
                  </TabsList>
                  <div className="text-xs text-muted-foreground">
                    {selectedAttacks.length > 0 ? `${selectedAttacks.length} attack vector(s) applied` : 'Baseline mode'}
                  </div>
                </div>

                <TabsContent value="protected">
                  <Card className="border-success/20 bg-success/5 shadow-none">
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <ShieldCheck size={16} className="text-success" />
                        Actual System Output
                      </CardTitle>
                      <CardDescription>
                        This is the response returned by the defended environment after attacks and protections were applied.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {isLoading ? (
                        <div className="space-y-3 rounded-xl border border-border/70 bg-card p-4">
                          <div className="h-4 w-[88%] animate-pulse rounded bg-muted" />
                          <div className="h-4 w-[70%] animate-pulse rounded bg-muted" />
                          <div className="h-4 w-[82%] animate-pulse rounded bg-muted" />
                        </div>
                      ) : (
                        <pre className="max-h-[65vh] min-h-[260px] overflow-y-auto whitespace-pre-wrap rounded-xl border border-success/20 bg-card p-4 text-sm leading-relaxed text-foreground stylish-scrollbar">
                          {results?.defended?.response ?? (selectedAttacks.length > 0 ? results?.attacked?.response : results?.clean?.response)}
                        </pre>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="breach">
                  <Card className="border-destructive/20 bg-destructive/5 shadow-none">
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <AlertTriangle size={16} className="text-destructive" />
                        Simulated Breach Consequence
                      </CardTitle>
                      <CardDescription>
                        This view shows what the model produced without the protection layer for the current scenario.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {isLoading ? (
                        <div className="space-y-3 rounded-xl border border-border/70 bg-card p-4">
                          <div className="h-4 w-[88%] animate-pulse rounded bg-muted" />
                          <div className="h-4 w-[70%] animate-pulse rounded bg-muted" />
                          <div className="h-4 w-[82%] animate-pulse rounded bg-muted" />
                        </div>
                      ) : results?.attacked ? (
                        <pre className="max-h-[65vh] min-h-[260px] overflow-y-auto whitespace-pre-wrap rounded-xl border border-destructive/20 bg-card p-4 font-mono text-sm leading-relaxed text-destructive/90 stylish-scrollbar">
                          {results.attacked.response}
                        </pre>
                      ) : (
                        <div className="rounded-xl border border-dashed border-border bg-card px-4 py-8 text-sm text-muted-foreground">
                          No unprotected breach output was generated for this run. Select attack vectors and re-run the simulator to compare exposed behavior.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="trace">
                  <Card className="shadow-none">
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Activity size={16} className="text-primary" />
                        Defense Pipeline Trace
                      </CardTitle>
                      <CardDescription>
                        Review each defense verdict to see where the pipeline flagged or passed the active scenario.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      {!selectedAttacks.length ? (
                        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-sm text-muted-foreground">
                          Baseline mode does not generate a defense trace. Add attack vectors to inspect pipeline verdicts.
                        </div>
                      ) : isLoading ? (
                        <div className="space-y-3">
                          <div className="h-24 animate-pulse rounded-xl bg-muted" />
                          <div className="h-24 animate-pulse rounded-xl bg-muted" />
                        </div>
                      ) : verdicts.length > 0 ? (
                        verdicts.map((v) => (
                          <div key={v.defenseId} className="rounded-xl border border-border bg-background p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <div className="text-base font-semibold text-foreground">{v.defenseName}</div>
                                <div className="mt-1 text-xs uppercase tracking-[0.22em] text-muted-foreground">Pipeline verdict</div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {v.confidence !== undefined && (
                                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                                    {Math.min(100, Math.max(0, v.confidence)).toFixed(0)}% confidence
                                  </span>
                                )}
                                <span
                                  className={cn(
                                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                                    v.triggered ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success',
                                  )}
                                >
                                  {v.triggered ? <ShieldAlert size={12} /> : <CheckCircle2 size={12} />}
                                  {v.triggered ? 'Flagged' : 'Passed'}
                                </span>
                              </div>
                            </div>
                            <div
                              className={cn(
                                'mt-4 rounded-xl border px-4 py-3 text-sm leading-relaxed',
                                v.triggered
                                  ? 'border-destructive/20 bg-destructive/5 text-foreground'
                                  : 'border-border bg-muted/20 text-muted-foreground',
                              )}
                            >
                              {v.triggered
                                ? (v.details || 'No specific explanation provided by the pipeline module.')
                                : 'System deemed the input secure and bypassed this defense cleanly.'}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-sm text-muted-foreground">
                          {selectedDefenses.length === 0
                            ? 'No defenses were active for this run, so the pipeline could not generate protection trace data.'
                            : 'The run completed without detailed pipeline verdict data.'}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

