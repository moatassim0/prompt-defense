import { type ReactNode, useEffect, useState } from 'react';
import { animate } from 'motion/react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type KpiTrend = 'up' | 'down' | 'neutral';

export interface KpiCardProps {
  title: string;
  value: string | number;
  description?: string;
  trend?: KpiTrend;
  icon: ReactNode;
}

function parseAnimateableValue(value: string | number): {
  target: number;
  suffix: string;
  decimals: number;
} {
  if (typeof value === 'number') {
    const dec = Number.isInteger(value) ? 0 : Math.min(4, (String(value).split('.')[1] ?? '').length || 2);
    return { target: value, suffix: '', decimals: dec };
  }
  const s = String(value);
  const match = s.match(/^(-?\d*\.?\d+)(.*)$/);
  if (!match || match[1] === '' || match[1] === '.' || !Number.isFinite(Number(match[1]))) {
    return { target: 0, suffix: s, decimals: 0 };
  }
  const numPart = match[1];
  const suffix = match[2] ?? '';
  const dec = numPart.includes('.') ? (numPart.split('.')[1]?.length ?? 0) : 0;
  return { target: parseFloat(numPart), suffix, decimals: dec };
}

function formatAnimated(target: number, decimals: number, suffix: string, rawValue: string | number): string {
  if (typeof rawValue === 'string' && !/^-?\d*\.?\d*/.test(String(rawValue).trim())) {
    return String(rawValue);
  }
  if (suffix === '' && decimals === 0) {
    return Math.round(target).toLocaleString();
  }
  const n = decimals > 0 ? target.toFixed(decimals) : String(Math.round(target));
  return `${n}${suffix}`;
}

function TrendGlyph({ trend }: { trend: KpiTrend }) {
  if (trend === 'up') {
    return <TrendingUp className="h-4 w-4 shrink-0 text-safe" aria-hidden />;
  }
  if (trend === 'down') {
    return <TrendingDown className="h-4 w-4 shrink-0 text-threat" aria-hidden />;
  }
  return <Minus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />;
}

export function KpiCard({ title, value, description, trend, icon }: KpiCardProps) {
  const [display, setDisplay] = useState(() => {
    const p = parseAnimateableValue(value);
    if (typeof value === 'string' && !/^-?\d*\.?\d*/.test(String(value).trim())) {
      return String(value);
    }
    return formatAnimated(0, p.decimals, p.suffix, value);
  });

  useEffect(() => {
    const { target, suffix, decimals } = parseAnimateableValue(value);
    if (typeof value === 'string' && !/^-?\d*\.?\d*/.test(String(value).trim())) {
      setDisplay(String(value));
      return;
    }

    let active = true;
    const controls = animate(0, target, {
      duration: 1.2,
      ease: [0, 0, 0.2, 1],
      onUpdate: (v) => {
        if (!active) return;
        setDisplay(formatAnimated(v, decimals, suffix, value));
      },
      onComplete: () => {
        if (active) setDisplay(formatAnimated(target, decimals, suffix, value));
      },
    });

    return () => {
      active = false;
      controls.stop();
    };
  }, [value]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-5 px-5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
            {icon}
          </div>
          <span className="text-sm font-medium leading-tight text-muted-foreground truncate">{title}</span>
        </div>
        {trend ? <TrendGlyph trend={trend} /> : null}
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-0">
        <div className="text-3xl font-bold tabular-nums tracking-tight text-foreground">{display}</div>
        {description ? (
          <p className={cn('mt-1.5 text-xs text-muted-foreground leading-snug')}>{description}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
