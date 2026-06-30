import { useEffect, useState } from 'react';
import { LogOut, User, Settings, Key } from 'lucide-react';

import type { AppSession } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

/** Better Auth client session (read-only UI). */
export type Session = AppSession;

export interface SessionFlyoutProps {
  session: Session | null;
  isOpen?: boolean;
  onSignOut: () => void;
  onOpenAccountSettings: () => void;
  onOpenPreferences: () => void;
  onOpenApiKeys: () => void;
}

function formatRoleLabel(role: string | undefined): string {
  if (!role) return 'User';
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function roleBadgeClass(role: string | undefined): string {
  switch (role) {
    case 'super_admin':
      return 'bg-purple-500/15 text-purple-400 border-purple-500/25';
    case 'admin':
      return 'bg-primary/15 text-primary border-primary/25';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

function getSessionExpiresAt(session: Session | null): unknown {
  if (!session) return undefined;
  const s = session as { session?: { expiresAt?: unknown }; expiresAt?: unknown };
  return s.session?.expiresAt ?? s.expiresAt;
}

function parseExpiresAtMs(expiresAt: unknown): number | null {
  if (expiresAt == null) return null;
  const t = new Date(expiresAt as string | number | Date).getTime();
  return Number.isNaN(t) ? null : t;
}

function formatExpiryAbsolute(expiresAtMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(expiresAtMs));
}

function formatExpiryRelative(expiresAtMs: number, nowMs: number): string {
  const diff = expiresAtMs - nowMs;
  if (diff <= 0) return 'Session expired — sign in again';

  const hoursTotal = diff / (1000 * 60 * 60);
  if (hoursTotal >= 48) {
    const days = Math.floor(hoursTotal / 24);
    const hours = Math.floor(hoursTotal % 24);
    return `${days}d ${hours}h remaining`;
  }
  if (hoursTotal >= 1) {
    const hours = Math.floor(hoursTotal);
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m remaining`;
  }
  const minutes = Math.max(1, Math.ceil(diff / (1000 * 60)));
  return `${minutes} minute${minutes === 1 ? '' : 's'} remaining`;
}

function SessionExpiryStatus({
  expiresAt,
  isOpen,
}: {
  expiresAt: unknown;
  isOpen: boolean;
}) {
  const expiresAtMs = parseExpiresAtMs(expiresAt);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!isOpen || expiresAtMs == null) return;
    setNowMs(Date.now());
    const interval = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, [isOpen, expiresAtMs]);

  if (expiresAtMs == null) {
    return (
      <>
        <p className="text-xs text-muted-foreground px-2">Session active</p>
        <p className="text-[0.65rem] text-muted-foreground/80 px-2 mt-0.5">
          Extended when you use the app
        </p>
      </>
    );
  }

  const relative = formatExpiryRelative(expiresAtMs, nowMs);

  return (
    <>
      <p className="text-xs text-muted-foreground px-2">
        Valid until {formatExpiryAbsolute(expiresAtMs)}
      </p>
      <p className="text-[0.65rem] text-muted-foreground/80 px-2 mt-0.5">
        {relative} · extended on activity
      </p>
    </>
  );
}

function flyoutInitial(session: Session | null): string {
  const name = session?.user?.name;
  const email = session?.user?.email;
  const raw =
    typeof name === 'string' && name.trim()
      ? name.trim()[0]
      : typeof email === 'string' && email.trim()
        ? email.trim()[0]
        : 'U';
  return raw.toUpperCase();
}

export function SessionFlyout({
  session,
  isOpen = false,
  onSignOut,
  onOpenAccountSettings,
  onOpenPreferences,
  onOpenApiKeys,
}: SessionFlyoutProps) {
  const role = (session?.user as { role?: string } | undefined)?.role;
  const expiresAt = getSessionExpiresAt(session);

  return (
    <div className="p-3">
      <div className="flex gap-3">
        <Avatar className="h-12 w-12 shrink-0">
          <AvatarImage src={session?.user?.image ?? undefined} alt="" />
          <AvatarFallback className="bg-[hsl(var(--sidebar-primary))] text-base font-bold text-white">
            {flyoutInitial(session)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {session?.user?.name ?? '—'}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {session?.user?.email ?? ''}
          </p>
          <span
            className={cn(
              'inline-block rounded border px-2 py-0.5 text-[0.65rem] font-semibold',
              roleBadgeClass(role),
            )}
          >
            Role: {formatRoleLabel(role)}
          </span>
        </div>
      </div>

      <Separator className="my-3" />

      <div className="flex flex-col space-y-1 mb-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onOpenAccountSettings}
          className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground hover:bg-accent/50 h-9"
        >
          <User className="h-4 w-4 shrink-0" />
          Account Settings
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onOpenPreferences}
          className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground hover:bg-accent/50 h-9"
        >
          <Settings className="h-4 w-4 shrink-0" />
          Preferences
        </Button>
        {(role === 'admin' || role === 'super_admin') && (
          <Button
            type="button"
            variant="ghost"
            onClick={onOpenApiKeys}
            className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground hover:bg-accent/50 h-9"
          >
            <Key className="h-4 w-4 shrink-0" />
            API Keys
          </Button>
        )}
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-foreground px-2">Session status</p>
        <SessionExpiryStatus expiresAt={expiresAt} isOpen={isOpen} />
      </div>

      <Separator className="my-3" />

      <Button
        type="button"
        variant="ghost"
        className="w-full justify-start gap-3 text-threat hover:bg-threat/10 hover:text-threat h-9"
        onClick={onSignOut}
      >
        <LogOut className="h-4 w-4 shrink-0" />
        Sign Out
      </Button>
    </div>
  );
}
