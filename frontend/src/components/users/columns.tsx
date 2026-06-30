import { ColumnDef } from '@tanstack/react-table';
import { User } from '../../../../shared/types';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Trash2, KeyRound, Crown, ShieldCheck, User as UserIcon, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

const ROLE_CONFIG: Record<string, { label: string; icon: React.ElementType; classes: string }> = {
  super_admin: {
    label: 'SUPER ADMIN',
    icon: Crown,
    classes: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  },
  admin: {
    label: 'ADMIN',
    icon: ShieldCheck,
    classes: 'bg-primary/15 text-primary border-primary/30',
  },
  user: {
    label: 'USER',
    icon: UserIcon,
    classes: 'bg-muted text-muted-foreground border-border',
  },
};

const initials = (email: string) => email.split('@')[0].slice(0, 2).toUpperCase();

function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return 'Never';
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return 'Never';
  const diffMs = d.getTime() - Date.now();
  const seconds = Math.round(diffMs / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  const weeks = Math.round(days / 7);
  const months = Math.round(days / 30);

  if (Math.abs(seconds) < 60) return rtf.format(seconds, 'second');
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  if (Math.abs(days) < 7) return rtf.format(days, 'day');
  if (Math.abs(weeks) < 4) return rtf.format(weeks, 'week');
  return rtf.format(months, 'month');
}

export const userColumns = (
  onDelete: (id: string) => void,
  onReset: (user: User) => void,
  currentUser?: User | null,
): ColumnDef<User>[] => [
  {
    accessorKey: 'email',
    header: 'Email',
    cell: ({ row }) => {
      const user = row.original;
      const role = user.role;
      const config = ROLE_CONFIG[role] || ROLE_CONFIG.user;

      return (
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold',
              config.classes,
            )}
          >
            {initials(user.email)}
          </div>
          <div>
            <div className="text-foreground font-medium flex items-center gap-1.5">
              {user.email}
              {user.id === currentUser?.id && (
                <span className="text-[0.6rem] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                  You
                </span>
              )}
            </div>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'role',
    header: 'Role',
    enableSorting: true,
    cell: ({ row }) => {
      const role = row.original.role;
      const config = ROLE_CONFIG[role] || ROLE_CONFIG.user;
      const Icon = config.icon;
      return (
        <Badge
          variant="outline"
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 text-[0.65rem] font-semibold',
            config.classes,
          )}
        >
          <Icon size={10} />
          {config.label}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'last_login_at',
    header: 'Last Active',
    cell: ({ row }) => {
      const lastActive = row.getValue('last_login_at') as Date | string | null | undefined;
      return (
        <div className="text-muted-foreground text-xs whitespace-nowrap">
          {formatRelativeTime(lastActive)}
        </div>
      );
    },
  },
  {
    accessorKey: 'created_at',
    header: 'Created At',
    cell: ({ row }) => {
      const dateStr = row.getValue('created_at') as string;
      const date = new Date(dateStr);
      return (
        <div className="text-muted-foreground text-xs">
          {new Intl.DateTimeFormat(navigator.language).format(date)}
        </div>
      );
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const u = row.original;
      const isSuperAdmin = currentUser?.role === 'super_admin';

      const canReset =
        u.id !== currentUser?.id &&
        ((isSuperAdmin && u.role !== 'super_admin') || (!isSuperAdmin && u.role === 'user'));

      const canDelete =
        u.id !== currentUser?.id &&
        u.role !== 'super_admin' &&
        (isSuperAdmin || u.role === 'user');

      if (!canReset && !canDelete) return null;

      return (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="User actions"
                className="h-8 w-8 text-muted-foreground"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {canReset && (
                <DropdownMenuItem
                  onClick={() => onReset(u)}
                  className="gap-2 cursor-pointer"
                >
                  <KeyRound size={14} />
                  Reset Password
                </DropdownMenuItem>
              )}
              {canReset && canDelete && <DropdownMenuSeparator />}
              {canDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(u.id)}
                  className="gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                >
                  <Trash2 size={14} />
                  Delete User
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
  },
];
