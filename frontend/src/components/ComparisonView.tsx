import React from 'react';
import { diffWords } from 'diff';
import { FileWarning, Download, Shield, AlertTriangle } from 'lucide-react';
import { ChatMessage } from '../../../shared/types';
import { cn } from '@/lib/utils';

interface ComparisonViewProps {
  before: ChatMessage | null;
  after: ChatMessage | null;
}

const ComparisonView: React.FC<ComparisonViewProps> = ({ before, after }) => {
  const generateReport = () => {
    if (!before && !after) return;
    const report = `PROMPT INJECTION DEFENSE REPORT
=====================================
Generated: ${new Date().toLocaleString()}

${before ? `BEFORE DEFENSE
--------------
Timestamp: ${new Date(before.timestamp).toLocaleString()}
Response: ${before.content}
Active Defenses: ${before.defenseState?.activeDefenses.join(', ') || 'None'}
Status: ${before.defenseState?.flagged ? 'FLAGGED' : 'Not flagged'}` : ''}

${after ? `AFTER DEFENSE
-------------
Timestamp: ${new Date(after.timestamp).toLocaleString()}
Response: ${after.content}
Active Defenses: ${after.defenseState?.activeDefenses.join(', ') || 'None'}
Status: ${after.defenseState?.flagged ? 'FLAGGED' : 'Not flagged'}` : ''}

ASSESSMENT
----------
${before && after ? `Defense Effectiveness: ${before.content !== after.content ? 'DEFENSES MODIFIED OUTPUT' : 'No changes detected'}` : 'Insufficient data'}
=====================================`;

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `defense-report-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!before && !after) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <FileWarning size={48} className="text-muted-foreground mb-4" />
        <h3 className="text-foreground text-lg font-semibold mb-1">No Comparison Selected</h3>
        <p className="text-muted-foreground text-sm">Select two responses in the chat to compare them.</p>
      </div>
    );
  }

  const diff = before && after ? diffWords(before.content, after.content) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield size={24} className="text-primary" />
          <h2 className="text-foreground text-xl font-semibold">Response Comparison</h2>
        </div>
        <button
          onClick={generateReport}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Download size={14} /> Download Report
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {before && (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <h3 className="text-foreground text-sm font-semibold">Before Defense</h3>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-muted-foreground text-xs">
                {new Date(before.timestamp).toLocaleString()}
              </div>
              {before.defenseState?.activeDefenses.length ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[0.65rem] bg-muted text-muted-foreground">
                  Defenses: {before.defenseState.activeDefenses.join(', ')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[0.65rem] bg-muted text-muted-foreground">No defenses</span>
              )}
              <div className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">{before.content}</div>
            </div>
          </div>
        )}

        {after && (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <h3 className="text-foreground text-sm font-semibold">After Defense</h3>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-muted-foreground text-xs">
                {new Date(after.timestamp).toLocaleString()}
              </div>
              {after.defenseState?.activeDefenses.length ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[0.65rem] bg-primary/10 text-primary">
                  Defenses: {after.defenseState.activeDefenses.join(', ')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[0.65rem] bg-muted text-muted-foreground">No defenses</span>
              )}
              <div className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">{after.content}</div>
              {after.defenseState?.flagged && (
                <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 rounded px-3 py-2">
                  <AlertTriangle size={12} /> Response was flagged by defense mechanisms
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {diff && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30">
            <h3 className="text-foreground text-sm font-semibold">Highlighted Differences</h3>
          </div>
          <div className="p-4 text-sm leading-relaxed">
            {diff.map((part, i) => (
              <span
                key={i}
                className={cn(
                  part.added ? 'bg-green-500/20 text-green-300' :
                    part.removed ? 'bg-red-500/20 text-red-300 line-through' :
                      'text-foreground',
                )}
              >
                {part.value}
              </span>
            ))}
          </div>
        </div>
      )}

      {after?.defenseState?.pipelineResult && after.defenseState.pipelineResult.verdicts.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30">
            <h3 className="text-foreground text-sm font-semibold">Defense Pipeline Verdicts</h3>
          </div>
          <div className="p-4 space-y-3">
            {after.defenseState.pipelineResult.verdicts.map((v: any, i: number) => (
              <div key={i} className="text-sm flex items-center gap-2">
                <span className={cn('w-2 h-2 rounded-full flex-shrink-0', v.triggered ? 'bg-destructive' : 'bg-green-400')} />
                <span className="text-foreground font-medium">{v.defenseName}</span>
                <span className="text-muted-foreground text-xs">— {v.details}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ComparisonView;
