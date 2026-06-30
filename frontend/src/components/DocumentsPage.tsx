import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { FileText, Upload, Trash2, Search, X, Copy, Check, FolderOpen } from 'lucide-react';
import { Document } from '../../../shared/types';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

interface DocumentsPageProps {
  documents: Document[];
  onUpload: (file: File) => void;
  onDelete: (id: string) => void;
}

export default function DocumentsPage({ documents, onUpload, onDelete }: DocumentsPageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [isDragging, setIsDragging] = useState(false);
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

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { onUpload(file); e.target.value = ''; }
  }, [onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.txt')) onUpload(file);
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

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-6">
      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              <FolderOpen size={14} />
              Document Library
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Manage uploaded documents</h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Upload text files, search your library, and inspect document content from one simple workspace.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Total</div>
              <div className="mt-1 text-sm font-medium text-foreground">{stats.total}</div>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Search</div>
              <div className="mt-1 text-sm font-medium text-foreground">{searchTerm ? 'Filtered' : 'All docs'}</div>
            </div>
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept=".txt" onChange={handleFileSelect} className="hidden" tabIndex={-1} />
      </section>

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
                    <CardDescription>Drop a `.txt` file here or use the button to add files to the library.</CardDescription>
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
                      <Button onClick={() => fileInputRef.current?.click()} className="w-full">
                        <Upload size={16} />
                        Choose file
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
                      <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search documents by name or meta..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full rounded-xl border border-border bg-background py-3 pl-11 pr-4 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                      />
                    </div>

                    {filteredDocuments.length === 0 ? (
                      <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/10 p-8 text-center">
                        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                          <FileText size={24} className="text-muted-foreground/50" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">No documents found</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {searchTerm ? 'Try a different search term.' : 'Upload your first document to begin.'}
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {filteredDocuments.map((doc) => (
                          <Card
                            key={doc.id}
                            className="group cursor-pointer rounded-xl border border-border transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md"
                            onClick={() => setSelectedDoc(doc)}
                            role="button"
                            tabIndex={0}
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
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-primary">
                                    <FileText size={10} />
                                    Document
                                  </span>
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
                  </CardContent>
                </Card>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

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
                <button onClick={handleCopyContent} className="relative group p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                  <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-[0.65rem] font-semibold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                    {copied ? 'Copied' : 'Copy'}
                  </span>
                </button>
                <button ref={closeBtnRef} onClick={() => setSelectedDoc(null)} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  <X size={18} />
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-background/50">
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
