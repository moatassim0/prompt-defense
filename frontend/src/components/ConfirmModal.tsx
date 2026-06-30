import { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) setTimeout(() => cancelRef.current?.focus(), 50);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in"
      onClick={onCancel}
      aria-modal="true"
      role="dialog"
      aria-labelledby="confirm-title"
    >
      <div
        className="bg-card border border-border rounded-lg shadow-lg w-full max-w-[400px] mx-4 animate-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 p-4 border-b border-border">
          {variant === 'danger' && (
            <span className="w-9 h-9 flex items-center justify-center rounded-full bg-destructive/10 text-destructive flex-shrink-0">
              <AlertTriangle size={18} />
            </span>
          )}
          <h2 id="confirm-title" className="text-foreground font-semibold text-base flex-1">
            {title}
          </h2>
          <button
            onClick={onCancel}
            aria-label="Cancel"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-muted-foreground text-sm px-4 py-4 leading-relaxed">{message}</p>

        <div className="flex justify-end gap-2 px-4 pb-4">
          <button
            ref={cancelRef}
            className="px-4 py-2 text-sm font-medium rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            className={cn(
              'px-4 py-2 text-sm font-semibold rounded-md transition-colors text-white',
              variant === 'danger'
                ? 'bg-destructive hover:bg-destructive/90'
                : 'bg-[#f97316] hover:bg-[#ea580c]',
            )}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
