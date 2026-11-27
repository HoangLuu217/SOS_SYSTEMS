import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

/* ==========================================================================
   Chronicle Settings Kit Primitives
   Ported faithfully from shadcnstore/shadcn-dashboard-landing-template:
   - kit/ui-patterns/icon-tile.tsx
   - kit/settings/section.tsx (SettingsHero, SettingsCard, HeroTitle, HeroFigure, ToggleRow)
   - kit/auth/password-strength.tsx (StrengthMeter)
   - kit/ui-patterns/save-bar.tsx (SaveBar)
   - features/settings/fit-hero.ts (SETTINGS_PAGE, FIT_HERO)
   ========================================================================== */

export const SETTINGS_PAGE = '@container/settings flex min-w-0 flex-col gap-4';

export const FIT_HERO =
  'md:flex-col @3xl/settings:flex-row [&>div:first-child]:w-auto @3xl/settings:[&>div:first-child]:w-2/5 [&>div:nth-child(2)]:border-s-0 [&>div:nth-child(2)]:border-t @3xl/settings:[&>div:nth-child(2)]:border-s @3xl/settings:[&>div:nth-child(2)]:border-t-0';

export type TileTone =
  | 'lead'
  | 'two'
  | 'three'
  | 'success'
  | 'info'
  | 'warning'
  | 'danger'
  | 'muted';

export const TILE_TONES: Record<TileTone, string> = {
  lead: 'bg-primary/15 text-primary',
  two: 'bg-chart-2/15 text-chart-2',
  three: 'bg-chart-3/20 text-foreground',
  success: 'bg-success/15 text-success',
  info: 'bg-info/15 text-info',
  warning: 'bg-warning/20 text-warning-foreground dark:text-warning',
  danger: 'bg-destructive/10 text-destructive',
  muted: 'bg-muted text-muted-foreground',
};

export function IconTile({
  icon: Icon,
  tone = 'lead',
  size = 'md',
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone?: TileTone;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center',
        size === 'sm' && 'size-8 rounded-lg [&>svg]:size-4',
        size === 'md' && 'size-10 rounded-xl [&>svg]:size-5',
        size === 'lg' && 'size-12 rounded-2xl [&>svg]:size-6',
        TILE_TONES[tone],
        className
      )}
      aria-hidden
    >
      <Icon />
    </span>
  );
}

export function SettingsWidget({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        'gap-4 rounded-2xl border-border/80 py-5 shadow-(--surface-shadow) ring-1 ring-foreground/5 [--card-spacing:1.25rem]',
        className
      )}
    >
      {children}
    </Card>
  );
}

export function SettingsHero({
  children,
  aside,
  className,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <SettingsWidget className={cn('gap-0 overflow-hidden p-0 md:flex-row', className)}>
      <div className={cn('flex flex-col gap-4 p-5', aside && 'md:w-2/5')}>{children}</div>
      {aside && (
        <div className="flex flex-1 flex-col justify-center gap-4 border-t border-border bg-muted/30 p-5 md:border-s md:border-t-0">
          {aside}
        </div>
      )}
    </SettingsWidget>
  );
}

export function SettingsCard({
  title,
  description,
  icon,
  tone = 'lead',
  action,
  footer,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: TileTone;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <SettingsWidget className={cn('gap-5 overflow-hidden', className)}>
      <div className="flex items-start gap-3 px-5">
        {icon && <IconTile icon={icon} tone={tone} size="sm" className="mt-0.5" />}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="font-heading text-base font-semibold text-foreground">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
      <div className="px-5">{children}</div>
      {footer && (
        <div className="-mb-5 flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
          {footer}
        </div>
      )}
    </SettingsWidget>
  );
}

export function HeroTitle({
  icon,
  tone,
  label,
  title,
  badge,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone?: TileTone;
  label: string;
  title: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <IconTile icon={icon} tone={tone} />
      <div className="flex min-w-0 flex-col">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="truncate font-heading text-lg font-semibold text-foreground">{title}</span>
      </div>
      {badge && <div className="ms-auto">{badge}</div>}
    </div>
  );
}

export function HeroFigure({
  value,
  unit,
  className,
}: {
  value: React.ReactNode;
  unit?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'font-mono text-4xl font-semibold tracking-tight text-foreground tabular-nums',
        className
      )}
    >
      {value}
      {unit && <span className="text-base font-normal text-muted-foreground">{unit}</span>}
    </div>
  );
}

export function ToggleRow({
  id,
  icon,
  tone = 'lead',
  title,
  description,
  checked,
  onCheckedChange,
  children,
  className,
}: {
  id: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: TileTone;
  title: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-xl bg-muted/40 p-3 transition-colors duration-150 hover:bg-muted/70',
        className
      )}
    >
      {icon && (
        <IconTile
          icon={icon}
          tone={checked ? tone : 'muted'}
          size="sm"
          className="mt-0.5 transition-colors duration-150"
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{title}</span>
        {description && <span className="text-xs text-muted-foreground">{description}</span>}
        {checked && children}
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} className="mt-1" />
    </label>
  );
}

export function passwordStrength(password: string, minimum = 8): number {
  if (!password) return 0;
  let score = password.length >= minimum + 4 ? 2 : password.length >= minimum ? 1 : 0;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/[\d\W_]/.test(password) || password.includes(' ')) score += 1;
  return Math.min(4, score);
}

const STRENGTH_LEVELS = [
  { label: 'Quá ngắn', bar: 'bg-destructive' },
  { label: 'Yếu', bar: 'bg-destructive' },
  { label: 'Trung bình', bar: 'bg-warning' },
  { label: 'Khá', bar: 'bg-success' },
  { label: 'Mạnh', bar: 'bg-success' },
] as const;

export function StrengthMeter({
  password,
  minimum = 8,
  id,
  className,
}: {
  password: string;
  minimum?: number;
  id?: string;
  className?: string;
}) {
  const score = passwordStrength(password, minimum);
  return (
    <div id={id} className={cn('flex items-center gap-3', className)} aria-live="polite">
      <div className="flex flex-1 gap-1" aria-hidden>
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors duration-200',
              password && score >= step ? STRENGTH_LEVELS[score].bar : 'bg-muted'
            )}
          />
        ))}
      </div>
      <span className="w-20 text-end text-xs text-muted-foreground">
        {password ? STRENGTH_LEVELS[score].label : 'Độ mạnh'}
      </span>
    </div>
  );
}

export function SaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
  saveLabel = 'Lưu thay đổi',
  message = 'Bạn có thay đổi chưa lưu',
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  saveLabel?: string;
  message?: string;
}) {
  if (!dirty) return null;

  return (
    <div
      role="region"
      aria-label="Thay đổi chưa lưu"
      className="sticky bottom-4 z-20 mx-auto flex w-full max-w-2xl items-center justify-between gap-3 rounded-xl border border-border bg-popover p-2 ps-4 text-popover-foreground shadow-lg"
    >
      <p role="status" className="text-sm font-medium text-foreground">
        {message}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>
          Hủy thay đổi
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving && <Loader2 className="size-3.5 animate-spin" />}
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
