import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Send, Shield, AlertTriangle, ChevronDown, MessageSquare, Loader2, Paperclip, Check, Upload, FileText, X } from 'lucide-react';
import { ChatMessage, Document } from '../../../shared/types';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { ChatMessageSkeleton } from './ui/skeletons';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const FORCED_JUDGE_SESSION_TOOLTIP =
  'Judge forced active for this session — Qwen will run on all subsequent turns until the session resets, regardless of the LLM-as-Judge toggle state.';

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
  documentIds?: string[];
}

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (prompt: string) => void;
  onUploadDocument: (file: File) => void;
  sessionTitle?: string;
  activeDocumentCount?: number;
  documents?: Document[];
  activeDocumentIds?: string[];
  onToggleDocument?: (id: string) => void;
  /** Regular users: sandbox messaging without defense toggles. Admins: full lab wording. */
  chatMode?: 'lab' | 'participant';
}

export default function ChatInterface({ 
  messages, 
  onSendMessage, 
  onUploadDocument,
  sessionTitle,
  activeDocumentCount,
  documents = [],
  activeDocumentIds = [],
  onToggleDocument,
  chatMode = 'lab',
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [expandedDefenseVerdicts, setExpandedDefenseVerdicts] = useState<Set<string>>(new Set());
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [parent] = useAutoAnimate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker when clicking outside
  useEffect(() => {
    if (!showDocPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowDocPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDocPicker]);

  const isWaiting = useMemo(() =>
    messages.length > 0 && messages[messages.length - 1].role === 'user',
    [messages],
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isWaiting) {
      onSendMessage(input);
      setInput('');
    }
  }, [input, isWaiting, onSendMessage]);

  const toggleDefenseVerdicts = useCallback((messageId: string) => {
    setExpandedDefenseVerdicts((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <MessageSquare size={20} className="text-[#f97316]" />
        <h2 className="text-foreground text-lg font-semibold">{sessionTitle || 'Chat'}</h2>
        {chatMode === 'participant' && (
          <span
            className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400"
            title="Prompt-injection sandbox: messages go to the model without the multi-layer defense pipeline (admin accounts enable defenses)."
          >
            Injection sandbox
          </span>
        )}
      </div>

      {/* Messages */}
      <div ref={parent} className="flex-1 overflow-y-auto space-y-4 mb-4 scrollbar-thin" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-2">
            <MessageSquare size={48} className="text-primary opacity-60 mb-4" />
            {chatMode === 'participant' ? (
              <>
                <h3 className="text-foreground text-lg font-semibold mb-1">Try prompt-injection scenarios</h3>
                <p className="text-muted-foreground text-sm max-w-md leading-relaxed">
                  This is a <span className="text-foreground font-medium">research sandbox</span>: send manipulative or adversarial prompts and attach{' '}
                  <span className="text-foreground font-medium">Documents</span> (upload a <code className="text-xs">.txt</code> or load{' '}
                  <span className="text-foreground font-medium">InfoBank</span> fixtures, including poisoned ones) to see how the model behaves.
                  Your account runs chat <span className="text-foreground font-medium">without</span> the multi-layer defense pipeline—admins enable defenses and scripted lab flows.
                </p>
                <p className="text-muted-foreground/90 text-xs max-w-md mt-3 leading-relaxed">
                  Tip: open the <span className="text-foreground font-medium">?</span> help panel for step-by-step guidance.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-foreground text-lg font-semibold mb-1">Lab chat</h3>
                <p className="text-muted-foreground text-sm max-w-md leading-relaxed">
                  Enable defenses under <span className="text-foreground font-medium">Defenses</span>, pick catalog attacks under{' '}
                  <span className="text-foreground font-medium">Attacks</span> or run side-by-sides in{' '}
                  <span className="text-foreground font-medium">Simulator</span>, then use this thread with attachments from the paperclip.
                </p>
              </>
            )}
          </div>
        ) : (
          messages.map((message) => {
            const isUser = message.role === 'user';
            return (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, x: isUser ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25 }}
                className={cn('flex flex-col', isUser ? 'items-end' : 'items-start')}
                {...(!isUser ? { 'data-llm': true } : {})}
              >
                <div className={cn(
                  'max-w-[75%] rounded-lg px-4 py-3',
                  isUser
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card border border-border text-foreground border-l-2 border-l-primary/30 pl-3 font-mono',
                )}>
                  <div className="flex items-center justify-between gap-4 mb-1">
                    <span className="text-xs font-medium opacity-75">
                      {isUser ? 'You' : 'AI Assistant'}
                    </span>
                    <span className="text-[0.65rem] opacity-50">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</div>

                  {/* Flag banner */}
                  {!isUser && message.defenseState?.flagged && (
                    <div className="flex items-center gap-1.5 mt-2 px-2.5 py-1.5 rounded bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                      <AlertTriangle size={12} />
                      Flagged by defense mechanisms
                    </div>
                  )}
                </div>

                {/* Defense indicators */}
                {!isUser && message.defenseState && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5 max-w-[75%]">
                    {message.defenseState.activeDefenses.length > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[0.65rem] bg-primary/10 text-primary border border-primary/20">
                        <Shield size={10} />
                        {message.defenseState.activeDefenses.join(', ')}
                      </span>
                    )}
                    {message.defenseState.flagged && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[0.65rem] bg-warn/10 text-warn border border-warn/20" aria-label="Result: Flagged by defense">
                        <AlertTriangle size={10} />
                        Flagged
                      </span>
                    )}
                  </div>
                )}

                {/* Defense pipeline verdicts panel */}
                {!isUser && message.defenseState?.pipelineResult && message.defenseState.pipelineResult.verdicts.length > 0 && (
                  <TooltipProvider delayDuration={0}>
                  <div className="max-w-[75%] mt-1.5">
                    <button
                      onClick={() => toggleDefenseVerdicts(message.id)}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      aria-expanded={expandedDefenseVerdicts.has(message.id)}
                    >
                      <Shield size={11} />
                      {message.defenseState.pipelineResult.verdicts.filter((v: any) => v.triggered).length > 0
                        ? `${message.defenseState.pipelineResult.verdicts.filter((v: any) => v.triggered).length} defense(s) triggered`
                        : 'All defenses passed'}
                      <ChevronDown size={11} className={cn('transition-transform', expandedDefenseVerdicts.has(message.id) && 'rotate-180')} />
                    </button>
                    {expandedDefenseVerdicts.has(message.id) && (
                      <div className="mt-1.5 p-2.5 bg-muted rounded-md space-y-1">
                        {message.defenseState.pipelineResult.forcedJudgeActive === true &&
                          !message.defenseState.activeDefenses.includes('llm-judge') && (
                            <div className="mb-2 flex items-center gap-2 text-xs text-warn bg-warn/10 border border-warn/20 rounded px-3 py-2">
                              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                              <span>Session escalation detected — Judge (Qwen) is active for this session</span>
                            </div>
                          )}
                        {message.defenseState.pipelineResult.verdicts.map((v: any, i: number) => (
                          <div key={i} className="text-xs flex items-center gap-2">
                            <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', v.triggered ? 'bg-destructive' : 'bg-safe')} />
                            <span className="text-foreground font-medium inline-flex items-center gap-1">
                              {v.defenseName}
                              {v.defenseId === 'turn-tracker' &&
                                message.defenseState?.pipelineResult?.forcedJudgeActive === true && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex cursor-help rounded p-0.5 text-warn" aria-label="Forced judge session">
                                        <AlertTriangle className="h-3 w-3" />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-xs text-xs">
                                      {FORCED_JUDGE_SESSION_TOOLTIP}
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                            </span>
                            <span className="text-muted-foreground">— {v.details.substring(0, 80)}{v.details.length > 80 ? '…' : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  </TooltipProvider>
                )}

              </motion.div>
            );
          })
        )}

        {/* Awaiting LLM response */}
        {isWaiting && <ChatMessageSkeleton />}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-3 mt-auto">
        {/* Document picker anchor */}
        <div ref={pickerRef} className="relative">
          <button
            type="button"
            onClick={() => setShowDocPicker(o => !o)}
            className={cn(
              'relative w-12 h-12 flex items-center justify-center rounded-lg border bg-card text-muted-foreground hover:bg-accent hover:text-foreground transition-colors',
              showDocPicker ? 'border-primary text-primary' : 'border-border',
            )}
            aria-label="Manage documents for this chat"
            aria-expanded={showDocPicker}
            disabled={isWaiting}
          >
            <Paperclip size={18} aria-hidden="true" />
            {(activeDocumentCount ?? 0) > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground shadow-sm">
                {activeDocumentCount}
              </span>
            )}
          </button>

          {/* Document picker popover */}
          {showDocPicker && (
            <div className="absolute bottom-full left-0 mb-2 w-72 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
                <div>
                  <p className="text-xs font-semibold text-foreground">Attach from library</p>
                  <p className="text-[0.65rem] text-muted-foreground mt-0.5">
                    {documents.length === 0
                      ? 'Library is empty — add docs in the Documents tab'
                      : `${activeDocumentIds.length} of ${documents.length} in context for this chat`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDocPicker(false)}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Close document picker"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Document list */}
              {documents.length === 0 ? (
                <div className="px-3 py-5 flex flex-col items-center gap-2 text-center">
                  <FileText size={22} className="text-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Your library is empty.<br />
                    Go to <span className="font-medium text-foreground">Documents</span> to upload files or load InfoBank fixtures, then come back here to attach them.
                  </p>
                </div>
              ) : (
                <div className="max-h-52 overflow-y-auto divide-y divide-border/40">
                  {documents.map(doc => {
                    const attached = activeDocumentIds.includes(doc.id);
                    return (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => onToggleDocument?.(doc.id)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
                      >
                        <div className={cn(
                          'h-4 w-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors',
                          attached ? 'bg-primary border-primary' : 'border-border bg-background',
                        )}>
                          {attached && <Check size={10} className="text-primary-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{doc.name}</p>
                          <p className="text-[0.65rem] text-muted-foreground">
                            {Math.round(doc.content.length / 1024)} KB
                          </p>
                        </div>
                        {attached && (
                          <span className="text-[0.6rem] font-bold uppercase tracking-wide text-primary flex-shrink-0">
                            On
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Upload new file */}
              <div className="px-3 py-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => { setShowDocPicker(false); fileInputRef.current?.click(); }}
                  className="flex w-full items-center gap-2 text-xs text-primary hover:text-primary/80 transition-colors py-0.5"
                >
                  <Upload size={12} />
                  Upload new .txt file
                </button>
              </div>
            </div>
          )}
        </div>

        <input 
          type="file" 
          accept=".txt" 
          ref={fileInputRef} 
          className="hidden" 
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              onUploadDocument(file);
              e.target.value = '';
            }
          }} 
        />
        <div className="relative flex-1">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question…"
            aria-label="Message input"
            disabled={isWaiting}
            maxLength={2000}
            className="w-full px-4 py-3 rounded-lg border border-input bg-background text-foreground text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-60"
          />
          {input.length > 200 && (
            <span className={cn('absolute right-3 bottom-1 text-[0.6rem]', input.length > 1800 ? 'text-destructive' : 'text-muted-foreground')}>
              {input.length}
            </span>
          )}
        </div>
        <button
          type="submit"
          disabled={!input.trim() || isWaiting}
          aria-label="Send message"
          className="w-12 h-12 flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isWaiting ? (
            <>
              <span className="sr-only" role="status">Waiting for response…</span>
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            </>
          ) : (
            <Send size={18} aria-hidden="true" />
          )}
        </button>
      </form>
    </div>
  );
}