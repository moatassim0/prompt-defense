import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Send, AlertCircle, Shield, AlertTriangle, ChevronDown, MessageSquare, Loader2, Paperclip } from 'lucide-react';
import { ChatMessage } from '../../../shared/types';
import { cn } from '@/lib/utils';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (prompt: string) => void;
  onSetComparison: (before: ChatMessage | null, after: ChatMessage | null) => void;
  onUploadDocument: (file: File) => void;
}

export default function ChatInterface({ messages, onSendMessage, onSetComparison, onUploadDocument }: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [selectedBefore, setSelectedBefore] = useState<string | null>(null);
  const [selectedAfter, setSelectedAfter] = useState<string | null>(null);
  const [expandedDefenseVerdicts, setExpandedDefenseVerdicts] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleCompare = useCallback(() => {
    const before = messages.find((m) => m.id === selectedBefore) || null;
    const after = messages.find((m) => m.id === selectedAfter) || null;
    onSetComparison(before, after);
  }, [messages, selectedBefore, selectedAfter, onSetComparison]);

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
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare size={20} className="text-primary" />
        <h2 className="text-foreground text-lg font-semibold">Chat</h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 scrollbar-thin" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare size={48} className="text-primary opacity-60 mb-4" />
            <h3 className="text-foreground text-lg font-semibold mb-1">Start a conversation</h3>
            <p className="text-muted-foreground text-sm max-w-md leading-relaxed">
              Upload documents, select an attack or defense, then send a message to see the AI's response.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={cn('flex flex-col', message.role === 'user' ? 'items-end' : 'items-start')}>
              <div className={cn(
                'max-w-[75%] rounded-lg px-4 py-3',
                message.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border text-foreground',
              )}>
                <div className="flex items-center justify-between gap-4 mb-1">
                  <span className="text-xs font-medium opacity-75">
                    {message.role === 'user' ? 'You' : 'AI Assistant'}
                  </span>
                  <span className="text-[0.65rem] opacity-50">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</div>

                {/* Flag banner */}
                {message.role === 'assistant' && message.defenseState?.flagged && (
                  <div className="flex items-center gap-1.5 mt-2 px-2.5 py-1.5 rounded bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                    <AlertTriangle size={12} />
                    Flagged by defense mechanisms
                  </div>
                )}
              </div>

              {/* Defense indicators */}
              {message.role === 'assistant' && message.defenseState && (
                <div className="flex flex-wrap gap-1.5 mt-1.5 max-w-[75%]">
                  {message.defenseState.activeDefenses.length > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[0.65rem] bg-primary/10 text-primary border border-primary/20">
                      <Shield size={10} />
                      {message.defenseState.activeDefenses.join(', ')}
                    </span>
                  )}
                  {message.defenseState.flagged && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[0.65rem] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <AlertCircle size={10} />
                      Flagged
                    </span>
                  )}
                </div>
              )}

              {/* Defense pipeline verdicts panel */}
              {message.role === 'assistant' && message.defenseState?.pipelineResult && message.defenseState.pipelineResult.verdicts.length > 0 && (
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
                      {message.defenseState.pipelineResult.verdicts.map((v: any, i: number) => (
                        <div key={i} className="text-xs flex items-center gap-2">
                          <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', v.triggered ? 'bg-destructive' : 'bg-green-400')} />
                          <span className="text-foreground font-medium">{v.defenseName}</span>
                          <span className="text-muted-foreground">— {v.details.substring(0, 80)}{v.details.length > 80 ? '…' : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Comparison actions */}
              {message.role === 'assistant' && (
                <div className="flex gap-2 mt-1.5">
                  <button
                    onClick={() => setSelectedBefore(message.id)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-[0.65rem] font-medium border transition-colors',
                      selectedBefore === message.id
                        ? 'bg-primary/10 text-primary border-primary/30'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Mark as "Before"
                  </button>
                  <button
                    onClick={() => setSelectedAfter(message.id)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-[0.65rem] font-medium border transition-colors',
                      selectedAfter === message.id
                        ? 'bg-primary/10 text-primary border-primary/30'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Mark as "After"
                  </button>
                </div>
              )}
            </div>
          ))
        )}

        {/* Typing indicator */}
        {isWaiting && (
          <div className="flex items-start">
            <div className="bg-card border border-border rounded-lg px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Comparison prompt */}
      {(selectedBefore || selectedAfter) && (
        <div className="flex items-center justify-between px-4 py-2 mb-2 rounded-md bg-card border border-border">
          <p className="text-sm text-muted-foreground">
            {selectedBefore && selectedAfter ? 'Two messages selected for comparison' : 'Select another message to compare'}
          </p>
          {selectedBefore && selectedAfter && (
            <button onClick={handleCompare} className="text-sm font-medium text-primary hover:text-primary/80 transition-colors">
              Compare Responses
            </button>
          )}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-12 h-12 flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title="Upload .txt document"
          disabled={isWaiting}
        >
          <Paperclip size={18} />
        </button>
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
          className="w-12 h-12 flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isWaiting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </form>
    </div>
  );
}
