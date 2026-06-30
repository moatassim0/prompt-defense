import React from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  icon: React.ReactNode;
  badgeLabel: string;
  title: string;
  description: React.ReactNode;
  stats?: React.ReactNode;
  actions?: React.ReactNode;
  badgeClassName?: string;
}

export function PageHeader({
  icon,
  badgeLabel,
  title,
  description,
  stats,
  actions,
  badgeClassName
}: PageHeaderProps) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-6 md:p-8 mb-6">
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl -ml-16 -mb-16 pointer-events-none" />
      
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3 flex-1">
          <div className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]", badgeClassName || "border-primary/20 bg-primary/5 text-primary")}>
            {icon}
            {badgeLabel}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">{title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        
        {(stats || actions) && (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center md:ml-auto">
            {stats && (
              <div className="grid grid-cols-2 gap-2 sm:grid-flow-col sm:auto-cols-max">
                {stats}
              </div>
            )}
            {actions && (
              <div className="flex items-center gap-3">
                {actions}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function PageHeaderStat({ label, value, valueClassName }: { label: React.ReactNode; value: React.ReactNode; valueClassName?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/50 px-3 py-2 min-w-[100px]">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-sm font-medium text-foreground", valueClassName)}>{value}</div>
    </div>
  );
}
