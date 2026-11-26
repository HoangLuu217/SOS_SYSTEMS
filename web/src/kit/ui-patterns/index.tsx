import * as React from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/* 1. Chronicle Segmented Control (kit/ui-patterns/segmented.tsx) */
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  ariaLabel?: string;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  'aria-label': ariaLabel,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  'aria-label'?: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'grid gap-0.5 rounded-lg border border-border bg-muted p-0.5',
        className
      )}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.ariaLabel || opt.label}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-all',
              active
                ? 'bg-card text-foreground shadow-(--surface-shadow)'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {Icon && <Icon className="size-3.5 shrink-0" />}
            {opt.label && <span className="truncate">{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* 2. Chronicle PageHeader (kit/ui-patterns/page-header.tsx) */
export function PageHeader({
  title,
  description,
  actions,
  meta,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between',
        className
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate font-heading text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {meta}
        </div>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* 3. Chronicle StatusBadge (kit/ui-patterns/status-badge.tsx) */
export type StatusTone = 'neutral' | 'success' | 'warning' | 'info' | 'danger' | 'muted';

const TONES: Record<StatusTone, string> = {
  neutral: '',
  success: 'border-transparent bg-success/15 text-success',
  warning: 'border-transparent bg-warning/20 text-warning-foreground dark:text-warning',
  info: 'border-transparent bg-info/15 text-info',
  danger: 'border-transparent bg-destructive/10 text-destructive dark:bg-destructive/20',
  muted: 'border-transparent bg-muted text-muted-foreground',
};

const DOTS: Record<StatusTone, string> = {
  neutral: 'bg-foreground/60',
  success: 'bg-success',
  warning: 'bg-warning',
  info: 'bg-info',
  danger: 'bg-destructive',
  muted: 'bg-muted-foreground',
};

export function StatusBadge({
  tone,
  children,
  dot = true,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn('gap-1.5 font-medium', TONES[tone], className)}>
      {dot && <span className={cn('size-1.5 rounded-full', DOTS[tone])} aria-hidden />}
      {children}
    </Badge>
  );
}

/* 4. Chronicle StatCard (kit/ui-patterns/stat-card.tsx) */
export function StatCard({
  label,
  value,
  delta,
  hint,
  invert = false,
  children,
}: {
  label: string;
  value: React.ReactNode;
  delta?: string;
  hint?: string;
  invert?: boolean;
  children?: React.ReactNode;
}) {
  const isNegative = delta?.trim().startsWith('-');
  const good = invert ? Boolean(isNegative) : !isNegative;

  return (
    <Card className="gap-3">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardDescription>{label}</CardDescription>
          {delta && (
            <Badge
              variant="outline"
              className={cn('tabular-nums', good ? 'text-success' : 'text-destructive')}
            >
              {isNegative ? <TrendingDown className="size-3" /> : <TrendingUp className="size-3" />}
              {delta}
            </Badge>
          )}
        </div>
        <CardTitle className="font-mono text-2xl font-semibold tabular-nums">{value}</CardTitle>
      </CardHeader>
      {(hint || children) && (
        <CardFooter className="flex-col items-start gap-1.5 bg-transparent pt-0 text-xs">
          {children}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </CardFooter>
      )}
    </Card>
  );
}
