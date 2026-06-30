import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { FileText, Upload, Trash2, Search, X, Copy, Check, FolderOpen, Loader2, CheckCircle2, ChevronDown, ChevronRight, ShieldAlert } from 'lucide-react';
import { Document } from '../../../shared/types';
import { INFOBANK_MANIFEST, type InfoBankEntry } from '../../../shared/infobank-manifest';
import { api } from '../services/api';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { PageHeader, PageHeaderStat } from './ui/page-header';
import { motion, AnimatePresence } from 'motion/react';
import { ListItemSkeleton } from './ui/skeletons';

interface InfoBankPanelProps {
  onLoad: (filename: string, folder: 'clean' | 'poisoned') => Promise<void>;
}

function InfoBankPanel({ onLoad }: InfoBankPanelProps) {
  const [open, setOpen] = useState(false);
  const [loadingFile, setLoadingFile] = useState<string | null>(null);
  const [loadedFile, setLoadedFile] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copiedQuery, setCopiedQuery] = useState<string | null>(null);

  const cleanDocs = INFOBANK_MANIFEST.filter((d: InfoBankEntry) => d.folder === 'clean');
  const poisonedDocs = INFOBANK_MANIFEST.filter((d: InfoBankEntry) => d.folder === 'poisoned');

  const handleLoad = async (filename: string, folder: 'clean' | 'poisoned') => {
    setLoadingFile(filename);
    setLoadError(null);
    setLoadedFile(null);
    try {
      await onLoad(filename, folder);
      setLoadedFile(filename);
      setTimeout(() => setLoadedFile(null), 3000);
    } catch (err: any) {
      setLoadError(err?.response?.data?.error ?? 'Failed to load document');
    } finally {
      setLoadingFile(null);
    }
  };

  const handleCopyQuery = async (filename: string, query: string) => {
    try {
      await navigator.clipboard.writeText(query);
      setCopiedQuery(filename);
      setTimeout(() => setCopiedQuery(null), 2000);
    } catch { /* ignore */ }
  };

  const renderEntry = (entry: InfoBankEntry, isPoisoned: boolean) => (
    <div
      key={entry.filename}
      className={cn(
        'rounded-xl border bg-card p-4',
        isPoisoned ? 'border-amber-500/20' : 'border-border',
      )}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{entry.displayName}</span>
            <span className="inline-flex items-center rounded-md bg-primary/10 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-primary">
              {entry.department}
            </span>
            {entry.attackType && (
              <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 border border-amber-500/20">
                {entry.attackType}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{entry.description}</p>
          <code className="mt-1.5 block text-[0.65rem] text-muted-foreground/60">{entry.path}</code>
        </div>

        <Button
          size="sm"
          disabled={loadingFile === entry.filename}
          onClick={() => handleLoad(entry.filename, entry.folder)}
          className={cn(
            'shrink-0 text-xs min-w-[64px]',
            isPoisoned
              ? 'bg-amber-600 hover:bg-amber-700 text-white'
              : undefined,
          )}
          variant={isPoisoned ? undefined : 'default'}
        >
          {loadingFile === entry.filename ? (
            <><Loader2 size={12} className="animate-spin" /> Loading</>
          ) : loadedFile === entry.filename ? (
            <><CheckCircle2 size={12} /> Loaded</>
          ) : 'Load'}
        </Button>
      </div>

      {/* Trigger query — only for poisoned fixtures */}
      {isPoisoned && entry.triggerQuery && (
        <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[0.6rem] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1">
                Test query — paste this into Chat to trigger the attack
              </p>
              <p className="text-xs text-foreground/80 leading-relaxed italic">
                "{entry.triggerQuery}"
              </p>
            </div>
            <button
              onClick={() => handleCopyQuery(entry.filename, entry.triggerQuery!)}
              className={cn(
                'shrink-0 flex items-center gap-1 text-[0.65rem] px-2 py-1 rounded-md border transition-colors',
                copiedQuery === entry.filename
                  ? 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400'
                  : 'border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10',
              )}
              aria-label="Copy test query"
            >
              {copiedQuery === entry.filename ? (
                <><Check size={10} /> Copied</>
              ) : (
                <><Copy size={10} /> Copy</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Success confirmation */}
      {loadedFile === entry.filename && (
        <div className="mt-3 rounded-lg border border-green-500/20 bg-green-500/5 px-3 py-2 text-xs text-green-600 dark:text-green-400">
          Document loaded and attached to the current chat. Switch to Chat and paste the test query above.
        </div>
      )}
    </div>
  );

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Test Fixtures</p>
        <h3 className="text-lg font-semibold text-foreground">InfoBank — Pre-built Documents</h3>
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-4 md:p-6">
          <button
            onClick={() => setOpen(o => !o)}
            className="flex w-full items-center justify-between gap-3 text-left"
            aria-expanded={open}
          >
            <div>
              <div className="text-sm font-semibold text-foreground">InfoBank — Test Fixtures</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Load a document into the library and attach it to Chat. Each poisoned fixture includes a test query that triggers its attack.
              </div>
            </div>
            {open ? <ChevronDown size={16} className="text-muted-foreground flex-shrink-0" /> : <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />}
          </button>

          {open && (
            <div className="mt-6 space-y-6">
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Clean Baselines</p>
                <div className="space-y-2">
                  {cleanDocs.map(entry => renderEntry(entry, false))}
                </div>
              </div>

              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Poisoned Fixtures</p>
                <div className="space-y-2">
                  {poisonedDocs.map(entry => renderEntry(entry, true))}
                </div>
              </div>

              {loadError && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {loadError}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

interface DocumentsPageProps {
  documents: Document[];
  isLoading?: boolean;
  onUpload: (file: File) => Promise<void>;
  onDelete: (id: string) => void;
  onRefresh?: () => Promise<void>;
  onAttachToChat?: (docId: string) => void;
  /** Regular users see sandbox-focused copy; admins keep full lab guidance (defenses / simulator). */
  variant?: 'lab' | 'participant';
}

export default function DocumentsPage({
  documents,
  isLoading = false,
  onUpload,
  onDelete,
  onRefresh,
  onAttachToChat,
  variant = 'lab',
}: DocumentsPageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [copied, setCopied] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (selectedDoc && closeBtnRef.current) closeBtnRef.current.focus();
  }, [selectedDoc]);

  useEffect(() => {
    if (!selectedDoc) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedDoc(null);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [selectedDoc]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadStatus('loading');
      try {
        await onUpload(file);
        setUploadStatus('success');
        setTimeout(() => setUploadStatus('idle'), 2000);
      } catch {
        setUploadStatus('idle');
      }
      e.target.value = '';
    }
  }, [onUpload]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.txt')) {
      setUploadStatus('loading');
      try {
        await onUpload(file);
        setUploadStatus('success');
        setTimeout(() => setUploadStatus('idle'), 2000);
      } catch {
        setUploadStatus('idle');
      }
    }
  }, [onUpload]);

  const handleCopyContent = useCallback(async () => {
    if (!selectedDoc?.content) return;
    try { await navigator.clipboard.writeText(selectedDoc.content); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* ignore */ }
  }, [selectedDoc]);

  const filteredDocuments = useMemo(() =>
    documents.filter((d) => {
      const query = searchTerm.toLowerCase();
      return (
        d.name.toLowerCase().includes(query)
        || d.content.toLowerCase().includes(query)
      );
    }),
    [documents, searchTerm],
  );

  const stats = useMemo(() => ({
    total: documents.length,
  }), [documents]);

  const handleLoadInfoBank = useCallback(async (filename: string, folder: 'clean' | 'poisoned') => {
    const result = await api.loadInfoBankDocument(filename, folder);
    await onRefresh?.();
    // Auto-attach to current chat so the document is immediately in context
    if (result?.document?.id) {
      onAttachToChat?.(result.document.id);
    }
  }, [onRefresh, onAttachToChat]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-6">
      <PageHeader
        icon={<FolderOpen size={14} />}
        badgeLabel="Document Library"
        title="Manage the document library"
        description={
          variant === 'participant'
            ? 'Sandbox library for Chat: upload .txt files or load InfoBank fixtures (clean baselines and poisoned prompts-in-documents). Attach from the paperclip in Chat to run manual prompt-injection experiments.'
            : 'This is the shared library for all chat sessions. Add documents here — via upload or InfoBank one-click load — then attach them to any chat using the paperclip button.'
        }
        stats={
          <>
            <PageHeaderStat label="Total" value={stats.total} />
            <PageHeaderStat label="Search" value={searchTerm ? 'Filtered' : 'All docs'} />
          </>
        }
      />
      <input ref={fileInputRef} type="file" accept=".txt" onChange={handleFileSelect} className="hidden" tabIndex={-1} />

      <section className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Manage</p>
          <h3 className="text-lg font-semibold text-foreground">Upload and organize the library</h3>
        </div>

        <Card className="rounded-2xl">
          <CardContent className="p-4 md:p-6">
            <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
              <div className="space-y-4">
                <Card className="shadow-none">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Upload size={16} className="text-primary" />
                      Upload Files
                    </CardTitle>
                    <CardDescription>
                      Drop a `.txt` file here or use the button to add files to the library.
                      <span className="mt-2 block text-amber-600/90 dark:text-amber-400/90">
                        {variant === 'participant'
                          ? 'Uploaded files are untrusted by default—use them as malicious context in Chat. InfoBank poisoned fixtures often include a suggested test query to paste after loading.'
                          : 'Uploaded files are untrusted by default: treat them as potentially malicious, keep defenses on in Chat, and use InfoBank &quot;clean&quot; fixtures if you need a known-safe baseline in the Simulator.'}
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div
                      className={cn(
                        'relative cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-300',
                        isDragging
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-muted/20 hover:border-primary/40 hover:bg-card',
                      )}
                      onDrop={handleDrop}
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onClick={() => fileInputRef.current?.click()}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity hover:opacity-100" />
                      <div className={cn(
                        'mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full transition-colors',
                        isDragging ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground',
                      )}>
                        <Upload size={20} className={cn(isDragging && 'animate-bounce')} />
                      </div>
                      <div className="text-sm font-medium text-foreground">{isDragging ? 'Drop it here' : 'Upload document'}</div>
                      <div className="mt-1 text-xs text-muted-foreground">TXT files only, up to 5MB</div>
                    </div>
                    <div className="mt-4">
                      <Button disabled={uploadStatus === 'loading'} onClick={() => fileInputRef.current?.click()} className="w-full relative overflow-hidden">
                        <AnimatePresence mode="wait">
                          {uploadStatus === 'idle' && (
                            <motion.div key="idle" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex items-center gap-2">
                              <Upload size={16} /> Choose file
                            </motion.div>
                          )}
                          {uploadStatus === 'loading' && (
                            <motion.div key="loading" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="flex items-center gap-2">
                              <Loader2 className="animate-spin" size={16} /> Uploading
                            </motion.div>
                          )}
                          {uploadStatus === 'success' && (
                            <motion.div key="success" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="flex items-center gap-2">
                              <CheckCircle2 size={16} /> Uploaded
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-3 xl:grid-cols-1">
                  <Card className="shadow-none">
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total docs</div>
                        <div className="mt-1 text-2xl font-bold text-foreground">{stats.total}</div>
                      </div>
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        <FileText size={18} className="text-primary" />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div className="space-y-4">
                <Card className="shadow-none">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Search size={16} className="text-primary" />
                      Search And Review
                    </CardTitle>
                    <CardDescription>Filter the current library and open any document for a full preview.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-0">
                    <div className="relative">
                      <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                      <input
                        type="text"
                        placeholder="Search documents by name or meta…"
                        aria-label="Search documents"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full rounded-xl border border-border bg-background py-3 pl-11 pr-4 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                      />
                    </div>

                    <AnimatePresence mode="wait">
                    {isLoading ? (
                      <motion.div key="skeleton" exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="min-h-[320px] pt-2">
                        <ListItemSkeleton count={4} />
                      </motion.div>
                    ) : (
                      <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
                    {filteredDocuments.length === 0 ? (
                      !searchTerm ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-16">
                          <FileText className="h-10 w-10 text-muted-foreground" />
                          <p className="text-sm font-medium text-foreground">No documents yet</p>
                          <p className="text-xs text-muted-foreground text-center max-w-xs">
                            Upload a .txt file to get started
                          </p>
                          <Button onClick={() => fileInputRef.current?.click()} variant="outline" size="sm">
                            <Upload size={16} />
                            Upload
                          </Button>
                        </div>
                      ) : (
                        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/10 p-8 text-center">
                          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                            <Search size={18} className="text-muted-foreground" />
                          </div>
                          <h3 className="text-sm font-medium text-foreground">No results found</h3>
                          <p className="mt-2 text-xs text-muted-foreground">Try a different search term.</p>
                        </div>
                      )
                    ) : (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {filteredDocuments.map((doc) => (
                          <Card
                            key={doc.id}
                            className="group cursor-pointer rounded-xl border border-border transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md"
                            onClick={() => setSelectedDoc(doc)}
                            role="button"
                            tabIndex={0}
                            aria-label={`Open document: ${doc.name}`}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedDoc(doc); }}
                          >
                            <CardContent className="p-4">
                              <div className="mb-3 flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-3">
                                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary flex-shrink-0">
                                    <FileText size={18} />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="truncate pr-2 text-sm font-semibold text-foreground" title={doc.name}>{doc.name}</div>
                                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                                      {new Intl.DateTimeFormat(navigator.language).format(new Date(doc.uploadedAt))}
                                      <span className="text-muted-foreground/30">•</span>
                                      {Math.round(doc.content.length / 1024)} KB
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/40 pt-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-primary">
                                    <FileText size={10} />
                                    Document
                                  </span>
                                  {doc.untrustedUpload && (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                                      <ShieldAlert size={10} />
                                      Untrusted upload
                                    </span>
                                  )}
                                  {doc.isPoisoned && (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-destructive/15 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-destructive">
                                      Adversarial fixture
                                    </span>
                                  )}
                                </div>

                                <button
                                  onClick={(e) => { e.stopPropagation(); onDelete(doc.id); }}
                                  className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive hover:text-white focus:opacity-100 group-hover:opacity-100"
                                  aria-label={`Delete ${doc.name}`}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                      </motion.div>
                    )}
                    </AnimatePresence>
                  </CardContent>
                </Card>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* InfoBank Panel */}
      <InfoBankPanel onLoad={handleLoadInfoBank} />

      {/* Modern Preview Modal */}
      {selectedDoc && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setSelectedDoc(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setSelectedDoc(null); }}
          tabIndex={-1}
        >
          <div className="bg-card border border-border/60 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col animate-in slide-in-from-bottom-4 duration-300 cursor-auto text-left" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between p-6 border-b border-border/40 bg-muted/20">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-inner bg-primary/10 text-primary">
                  <FileText size={24} />
                </div>
                <div>
                  <h3 className="text-foreground text-lg font-bold tracking-tight">{selectedDoc.name}</h3>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-muted-foreground text-xs">{new Date(selectedDoc.uploadedAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleCopyContent} aria-label="Copy document content" className="relative group p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  {copied ? <Check size={18} className="text-safe" /> : <Copy size={18} />}
                  <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-[0.65rem] font-semibold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                    {copied ? 'Copied' : 'Copy'}
                  </span>
                </button>
                <button ref={closeBtnRef} onClick={() => setSelectedDoc(null)} aria-label="Close document preview" className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  <X size={18} />
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-background/50 space-y-3">
              {(selectedDoc.untrustedUpload || selectedDoc.isPoisoned) && (
                <div
                  role="alert"
                  className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
                >
                  <p className="font-semibold flex items-center gap-2">
                    <ShieldAlert size={16} className="shrink-0" />
                    {selectedDoc.isPoisoned
                      ? 'Adversarial fixture — known attack document in the library.'
                      : 'Untrusted upload — unknown provenance; treat as potentially malicious.'}
                  </p>
                  <p className="mt-1.5 text-xs opacity-90">
                    {selectedDoc.isPoisoned
                      ? 'Excluded from Simulator clean baselines. Safe to use for red-team demos with defenses configured.'
                      : 'Excluded from Simulator clean baselines. Prefer InfoBank clean baselines when you need a trusted background document.'}
                  </p>
                </div>
              )}
              <div className="relative group/code">
                <pre className="bg-card border border-border/50 p-5 rounded-xl text-sm text-foreground/90 whitespace-pre-wrap break-words leading-relaxed font-mono shadow-inner max-h-[400px] overflow-y-auto scrollbar-thin">
                  {selectedDoc.content}
                </pre>
              </div>
            </div>
            
            <div className="flex justify-between items-center p-6 border-t border-border/40 bg-muted/20">
              <span className="text-muted-foreground text-xs font-medium">
                Size: {(selectedDoc.content.length / 1024).toFixed(2)} KB
              </span>
              <div className="flex gap-3">
                <Button onClick={() => setSelectedDoc(null)} variant="outline">
                  Close
                </Button>
                <Button
                  onClick={() => { onDelete(selectedDoc.id); setSelectedDoc(null); }}
                  variant="destructive"
                >
                  <Trash2 size={16} /> Delete Document
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
