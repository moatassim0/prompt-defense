import { useState, useCallback } from 'react';
import {
  GitCompare,
  Play,
  Loader2,
  AlertTriangle,
  Cpu,
  Clock,
  AlertOctagon,
  Shuffle,
  Sparkles,
  Activity,
  CheckCircle,
} from 'lucide-react';
import { api } from '../services/api';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

interface ComparisonResult {
  provider: string;
  response: string;
  success: boolean;
  executionTimeMs: number;
  error?: string;
}

const PROVIDERS = [
  { id: 'cerebras', name: 'Cerebras Llama-3', color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  { id: 'openai', name: 'OpenAI GPT-4o', color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  { id: 'anthropic', name: 'Anthropic Claude 3.5', color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30' }
];

export default function LLMComparisonPage() {
  const [prompt, setPrompt] = useState('Should I approve a $50,000 marketing budget request with no ROI analysis?');
  const [providers, setProviders] = useState<string[]>(['cerebras', 'openai']);
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const toggleProvider = useCallback((p: string) => {
    setProviders((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  }, []);

  const runComparison = useCallback(async () => {
    if (!prompt.trim() || providers.length === 0) {
      setError('Please enter a prompt and select at least one provider.');
      return;
    }
    setRunning(true); setError(''); setResults([]);

    try {
      const response = await api.compareProviders({ prompt, providers });
      setResults(response.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to compare providers.');
    } finally {
      setRunning(false);
    }
  }, [prompt, providers]);

  const successfulResults = results.filter((result) => result.success);
  const averageLatency = successfulResults.length > 0
    ? Math.round(successfulResults.reduce((total, result) => total + result.executionTimeMs, 0) / successfulResults.length)
    : null;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-6">
      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              <GitCompare size={14} />
              Model Comparison
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Compare inference behavior across providers</h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Build a prompt scenario, choose the providers to compare, and inspect differences in latency, success state, and response quality in one workspace.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Providers</div>
              <div className="mt-1 text-sm font-medium text-foreground">{providers.length} selected</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Prompt</div>
              <div className="mt-1 text-sm font-medium text-foreground">{prompt.trim() ? 'Ready' : 'Empty'}</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Results</div>
              <div className="mt-1 text-sm font-medium text-foreground">{results.length}</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Avg Latency</div>
              <div className="mt-1 text-sm font-medium text-foreground">{averageLatency !== null ? `${averageLatency}ms` : '--'}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Setup</p>
          <h3 className="text-lg font-semibold text-foreground">Configure the comparison run</h3>
        </div>

        <Card className="rounded-2xl">
          <CardContent className="p-4 md:p-6">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.95fr)]">
              <Card className="shadow-none">
                <CardHeader className="pb-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Sparkles size={16} className="text-primary" />
                        Prompt Setup
                      </CardTitle>
                      <CardDescription>Generate a quick test prompt or write a custom prompt to send to each selected provider.</CardDescription>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={running}
                      onClick={async () => {
                        try {
                          const res = await api.getRandomPrompt();
                          setPrompt(res.prompt);
                        } catch {
                          setError('Failed to fetch random prompt.');
                        }
                      }}
                    >
                      <Shuffle size={14} />
                      Random prompt
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={running}
                    rows={8}
                    aria-label="Comparison prompt"
                    placeholder="Enter prompt to execute across selected models..."
                    className="min-h-[220px] w-full resize-y rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                  />
                  {error && (
                    <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" role="alert">
                      <AlertOctagon size={16} />
                      {error}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card className="shadow-none">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Cpu size={16} className="text-primary" />
                      Providers
                    </CardTitle>
                    <CardDescription>Select the models you want to run side-by-side.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0">
                    {PROVIDERS.map((provider) => {
                      const isSelected = providers.includes(provider.id);
                      return (
                        <button
                          key={provider.id}
                          onClick={() => toggleProvider(provider.id)}
                          disabled={running}
                          className={cn(
                            'w-full rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-50',
                            isSelected
                              ? `${provider.border} ${provider.bg}`
                              : 'border-border bg-background hover:bg-muted/40',
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <span className={cn('h-2.5 w-2.5 rounded-full', provider.color.replace('text-', 'bg-'))} />
                              <div>
                                <div className="text-sm font-medium text-foreground">{provider.name}</div>
                                <div className="text-xs text-muted-foreground">{provider.id}</div>
                              </div>
                            </div>
                            {isSelected && <CheckCircle size={16} className={provider.color} />}
                          </div>
                        </button>
                      );
                    })}
                  </CardContent>
                </Card>

                <Card className="border-amber-500/20 bg-amber-500/5 shadow-none">
                  <CardContent className="flex gap-3 p-4">
                    <AlertTriangle size={18} className="mt-0.5 flex-shrink-0 text-amber-400" />
                    <div className="text-sm">
                      <div className="font-medium text-amber-300">Configuration note</div>
                      <p className="mt-1 leading-relaxed text-muted-foreground">
                        OpenAI and Anthropic providers require valid backend API keys. Cerebras is pre-configured for faster local testing.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-full bg-background px-3 py-1 text-xs font-medium text-foreground">
                      {providers.length} provider(s)
                    </span>
                    <span className="inline-flex items-center rounded-full bg-background px-3 py-1 text-xs font-medium text-foreground">
                      {prompt.trim() ? 'Prompt loaded' : 'Prompt required'}
                    </span>
                  </div>
                  <div className="mt-4">
                    <Button
                      onClick={runComparison}
                      disabled={running || providers.length === 0 || !prompt.trim()}
                      size="lg"
                      className="w-full"
                    >
                      {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                      {running ? 'Executing comparison' : 'Run comparison'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Run And Observe</p>
          <h3 className="text-lg font-semibold text-foreground">Track the comparison run</h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Activity size={14} className="text-primary" />
                Status
              </div>
              <div className="mt-3 text-lg font-bold text-foreground">
                {running ? 'Running' : results.length > 0 ? 'Completed' : 'Idle'}
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Cpu size={14} className="text-primary" />
                Queried
              </div>
              <div className="mt-3 text-lg font-bold text-foreground">{providers.length}</div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <CheckCircle size={14} className="text-success" />
                Successful
              </div>
              <div className="mt-3 text-lg font-bold text-success">{successfulResults.length}</div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Clock size={14} className="text-primary" />
                Avg Latency
              </div>
              <div className="mt-3 text-lg font-bold text-foreground">{averageLatency !== null ? `${averageLatency}ms` : '--'}</div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Analyze</p>
          <h3 className="text-lg font-semibold text-foreground">Review the model outputs side-by-side</h3>
        </div>

        {running && results.length === 0 ? (
          <Card className="rounded-2xl border-dashed">
            <CardContent className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center">
              <Loader2 size={44} className="mb-4 animate-spin text-primary/70" />
              <h4 className="text-lg font-semibold text-foreground">Running inference</h4>
              <p className="mt-2 text-sm text-muted-foreground">
                Querying {providers.length} model{providers.length !== 1 ? 's' : ''} in parallel.
              </p>
            </CardContent>
          </Card>
        ) : results.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {results.map((result) => {
              const info = PROVIDERS.find((provider) => provider.id === result.provider) || PROVIDERS[0];
              return (
                <Card
                  key={result.provider}
                  className={cn(
                    'rounded-2xl overflow-hidden',
                    result.success ? info.border : 'border-destructive/30',
                  )}
                >
                  <div className={cn(
                    'flex items-center justify-between border-b px-5 py-4',
                    result.success ? `${info.bg} ${info.border}` : 'border-destructive/20 bg-destructive/5',
                  )}>
                    <div className="flex items-center gap-3">
                      <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', result.success ? 'bg-background/80' : 'bg-destructive/10')}>
                        {result.success ? <Cpu size={16} className={info.color} /> : <AlertOctagon size={16} className="text-destructive" />}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-foreground">{info.name}</div>
                        <div className="text-xs text-muted-foreground">{result.provider}</div>
                      </div>
                    </div>
                    {result.success ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        <Clock size={12} className={info.color} />
                        {result.executionTimeMs}ms
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
                        Failed
                      </span>
                    )}
                  </div>

                  <CardContent className="pt-0">
                    <div className="max-h-[420px] overflow-y-auto p-5 scrollbar-thin">
                      <div className={cn(
                        'whitespace-pre-wrap text-sm leading-relaxed',
                        result.success ? 'text-foreground/90' : 'font-medium text-destructive',
                      )}>
                        {result.success ? result.response : result.error}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="rounded-2xl border-dashed">
            <CardContent className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <GitCompare size={24} className="text-muted-foreground/50" />
              </div>
              <h4 className="text-lg font-semibold text-foreground">No results yet</h4>
              <p className="mt-2 max-w-lg text-sm text-muted-foreground">
                Select the providers, enter a prompt, and run the comparison to inspect the responses here.
              </p>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
