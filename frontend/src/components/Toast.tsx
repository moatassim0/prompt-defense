import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
}

interface ToastContextValue {
  toast: {
    success: (message: string, duration?: number) => void;
    error: (message: string, duration?: number) => void;
    warning: (message: string, duration?: number) => void;
    info: (message: string, duration?: number) => void;
  };
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const add = useCallback(
    (type: ToastType, message: string, duration = 4000) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => [...prev, { id, type, message, duration }]);
      if (duration > 0) setTimeout(() => remove(id), duration);
    },
    [remove],
  );

  const toast = {
    success: (msg: string, dur?: number) => add('success', msg, dur),
    error: (msg: string, dur?: number) => add('error', msg, dur),
    warning: (msg: string, dur?: number) => add('warning', msg, dur),
    info: (msg: string, dur?: number) => add('info', msg, dur),
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm" role="region" aria-label="Notifications">
        {toasts.map((t) => (
          <ToastCard key={t.id} item={t} onRemove={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const ICONS: Record<ToastType, ReactNode> = {
  success: <CheckCircle2 size={18} />,
  error: <XCircle size={18} />,
  warning: <AlertTriangle size={18} />,
  info: <Info size={18} />,
};

const TYPE_STYLES: Record<ToastType, string> = {
  success: 'border-l-green-500 text-green-400',
  error: 'border-l-red-500 text-red-400',
  warning: 'border-l-amber-500 text-amber-400',
  info: 'border-l-blue-500 text-blue-400',
};

function ToastCard({ item, onRemove }: { item: ToastItem; onRemove: (id: string) => void }) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 rounded-lg border border-border bg-card shadow-lg animate-slide-in border-l-4',
        TYPE_STYLES[item.type],
      )}
      role="alert"
      aria-live={item.type === 'error' ? 'assertive' : 'polite'}
    >
      <span className="flex-shrink-0 mt-0.5">{ICONS[item.type]}</span>
      <span className="flex-1 text-sm text-foreground">{item.message}</span>
      <button
        className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => onRemove(item.id)}
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
    </div>
  );
}
