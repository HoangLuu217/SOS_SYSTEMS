import * as React from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Chronicle Dashboard Widget Frame
 * Mirrors shadcn-dashboard-landing-template/kit/widgets/widget.tsx
 */
export function Widget({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        'gap-4 rounded-2xl border-border/70 bg-card py-5 shadow-(--surface-shadow) [--card-spacing:1.25rem]',
        className
      )}
    >
      {children}
    </Card>
  );
}

export function WidgetHeader({
  title,
  icon: Icon,
  action,
  className,
}: {
  title: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-2 px-(--card-spacing)', className)}>
      <div className="flex min-w-0 items-center gap-2 text-[15px] font-medium text-foreground">
        {Icon && <Icon className="size-4 shrink-0 text-primary" />}
        <span className="truncate">{title}</span>
      </div>
      {action && <div className="-my-1 -me-1 flex shrink-0 items-center gap-1">{action}</div>}
    </div>
  );
}

/** ↑ 2.5% in green or ↓ 1.2% in red. `invert` for metrics where down is good. */
export function Delta({
  value,
  invert = false,
  className,
}: {
  value: number | null | undefined;
  invert?: boolean;
  className?: string;
}) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  const up = value >= 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUp : ArrowDown;
  const pct = Math.abs(value * 100);
  const formatted = pct >= 100 ? `${Math.round(pct)}%` : `${pct.toFixed(pct < 10 ? 1 : 0)}%`;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-mono text-xs font-medium tabular-nums',
        good ? 'text-success' : 'text-destructive',
        className
      )}
    >
      <Icon className="size-3.5" />
      {formatted}
    </span>
  );
}

/** Big monospace headline figure with optional delta arrow and muted caption. */
export function WidgetValue({
  value,
  delta,
  invert,
  caption,
  size = 'lg',
  className,
}: {
  value: React.ReactNode;
  delta?: number | null;
  invert?: boolean;
  caption?: React.ReactNode;
  size?: 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const sizes = { md: 'text-2xl', lg: 'text-3xl', xl: 'text-4xl sm:text-5xl' };
  return (
    <div className={cn('flex flex-col gap-1 px-(--card-spacing)', className)}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={cn('font-mono font-semibold tracking-tight text-foreground tabular-nums', sizes[size])}>
          {value}
        </span>
        {size === 'xl' && <Delta value={delta} invert={invert} />}
      </div>
      {(size !== 'xl' || caption) && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {size !== 'xl' && <Delta value={delta} invert={invert} />}
          {caption && (
            <span className="font-mono text-xs text-muted-foreground tabular-nums">{caption}</span>
          )}
        </div>
      )}
    </div>
  );
}

export interface PeriodColumn {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: string;
  value: string;
  delta?: number | null;
  invert?: boolean;
  caption: string;
}

/** 3-column period / KPI header inside hero widgets. */
export function PeriodHeader({
  columns,
  className,
}: {
  columns: PeriodColumn[];
  className?: string;
}) {
  return (
    <div className={cn('grid gap-4 px-(--card-spacing) sm:grid-cols-3', className)}>
      {columns.map((column) => {
        const Icon = column.icon;
        return (
          <div key={column.label} className="flex min-w-0 flex-col gap-1">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              {Icon && <Icon className={cn('size-3.5', column.tone)} />}
              {column.label}
            </span>
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                {column.value}
              </span>
              <Delta value={column.delta} invert={column.invert} />
            </span>
            <span className="truncate text-xs text-muted-foreground">{column.caption}</span>
          </div>
        );
      })}
    </div>
  );
}
