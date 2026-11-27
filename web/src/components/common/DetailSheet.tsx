import * as React from 'react';
import { Maximize2, Minimize2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SaveBar } from '@/kit/settings/SettingsPrimitives';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export type DetailSheetSize = 'md' | 'lg' | 'xl' | '2xl';

export interface DetailSheetSaveBarConfig {
  dirty: boolean;
  saving?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  saveLabel?: string;
  message?: string;
}

const SIZE_CLASSES: Record<DetailSheetSize, string> = {
  md: 'sm:max-w-md',
  lg: 'sm:max-w-xl',
  xl: 'sm:max-w-2xl',
  '2xl': 'sm:max-w-3xl',
};

export interface DetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  badges?: React.ReactNode;
  icon?: React.ReactNode;
  headerActions?: React.ReactNode;
  headerExtra?: React.ReactNode;
  footer?: React.ReactNode;
  saveBar?: DetailSheetSaveBarConfig;
  size?: DetailSheetSize;
  expandable?: boolean;
  zIndex?: number;
  bodyClassName?: string;
  children: React.ReactNode;
}

/**
 * Shared Chronicle Detail Sheet (matching shadcn-dashboard-landing-template/features/users/user-sheet.tsx)
 * Unified slide-over detail drawer used across all feature views (SOS, Rescuers, Citizens, Shelters,
 * Hazards, Alerts, Safety Checks, Blood Donations, Weather, Resources, Authorities, Tactical Chat).
 */
export const DetailSheet: React.FC<DetailSheetProps> = ({
  open,
  onOpenChange,
  title,
  description,
  badges,
  icon,
  headerActions,
  headerExtra,
  footer,
  saveBar,
  size = 'lg',
  expandable = true,
  zIndex = 1400,
  bodyClassName,
  children,
}) => {
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    if (!open) setExpanded(false);
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        zIndex={zIndex}
        className={cn(
          'w-full gap-0',
          expanded ? 'sm:max-w-4xl' : SIZE_CLASSES[size]
        )}
      >
        <SheetHeader className="border-b border-border bg-card/60 px-5 py-4 pe-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              {icon && (
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  {icon}
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle className="truncate">{title}</SheetTitle>
                  {badges}
                </div>
                {description && (
                  <SheetDescription className="line-clamp-2 text-xs">
                    {description}
                  </SheetDescription>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {headerActions}
              {expandable && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setExpanded((prev) => !prev)}
                  aria-label={expanded ? 'Thu gọn khung chi tiết' : 'Mở rộng khung chi tiết'}
                  title={expanded ? 'Thu gọn' : 'Mở rộng'}
                  className="hidden sm:inline-flex"
                >
                  {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onOpenChange(false)}
                aria-label="Đóng (Esc)"
                title="Đóng (Esc)"
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        {headerExtra && (
          <div className="shrink-0 border-b border-border bg-muted/25">{headerExtra}</div>
        )}

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            className={cn(
              'ch-detail-sheet-body min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 [scrollbar-width:thin]',
              saveBar?.dirty && 'pb-24',
              bodyClassName
            )}
          >
            {children}
          </div>

          {saveBar?.dirty && (
            <div className="pointer-events-none absolute inset-x-4 bottom-4 z-30 flex justify-center">
              <SaveBar
                dirty={saveBar.dirty}
                saving={Boolean(saveBar.saving)}
                onSave={saveBar.onSave}
                onDiscard={saveBar.onDiscard}
                saveLabel={saveBar.saveLabel || 'Lưu thay đổi'}
                message={saveBar.message || 'Bạn có thay đổi chưa lưu'}
                className="pointer-events-auto static bottom-auto max-w-xl shadow-xl ring-1 ring-foreground/8"
              />
            </div>
          )}
        </div>

        {footer && (
          <SheetFooter className="flex-row flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/30 px-5 py-3">
            {footer}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
};

/* ==========================================================================
   Chronicle Detail Sub-Primitives (matching shadcn-ref/features/users/user-detail.tsx)
   ========================================================================== */

export interface DetailFactItem {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}

export const DetailFacts: React.FC<{
  items: DetailFactItem[];
  className?: string;
}> = ({ items, className }) => (
  <dl className={cn('grid gap-3 text-sm', className)}>
    {items.map((item) => {
      const Icon = item.icon;
      return (
        <div key={item.label} className="grid grid-cols-[7.5rem_1fr] items-start gap-3">
          <dt className="flex items-center gap-2 text-muted-foreground">
            {Icon && <Icon className="size-4 shrink-0" />}
            <span>{item.label}</span>
          </dt>
          <dd className="min-w-0 break-words text-foreground">{item.value}</dd>
        </div>
      );
    })}
  </dl>
);

export const DetailSection: React.FC<{
  title: React.ReactNode;
  action?: React.ReactNode;
  muted?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ title, action, muted = true, className, children }) => (
  <section className={cn('flex flex-col gap-2.5', className)}>
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {action}
    </div>
    <div
      className={cn(
        'rounded-xl text-sm',
        muted ? 'bg-muted/50 p-4' : 'border border-border bg-card p-4'
      )}
    >
      {children}
    </div>
  </section>
);

export { Separator as DetailSeparator };
