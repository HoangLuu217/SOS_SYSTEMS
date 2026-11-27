import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

const SheetContext = React.createContext<{ onClose: () => void }>({ onClose: () => {} });

const HIGHER_MODAL_SELECTOR =
  '[data-modal-layer="confirm"], .ra-modal-backdrop, .sc-modal-overlay, .executive-modal-backdrop, .weather-modal-backdrop, .sos-modal-overlay';

export function Sheet({ open, onOpenChange, children }: SheetProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (typeof document !== 'undefined' && document.querySelector(HIGHER_MODAL_SELECTOR)) {
          return;
        }
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <SheetContext.Provider value={{ onClose: () => onOpenChange(false) }}>
      {children}
    </SheetContext.Provider>,
    document.body
  );
}

export function SheetContent({
  className,
  children,
  side = 'right',
  showCloseButton = true,
  zIndex = 1400,
  style,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  side?: 'right' | 'left';
  showCloseButton?: boolean;
  zIndex?: number;
}) {
  const { onClose } = React.useContext(SheetContext);

  return (
    <div
      data-slot="sheet-overlay"
      onClick={onClose}
      style={{ zIndex }}
      className="fixed inset-0 bg-black/20 backdrop-blur-[1px] transition-opacity"
    >
      <div
        role="dialog"
        aria-modal="true"
        data-slot="sheet-content"
        data-side={side}
        onClick={(e) => e.stopPropagation()}
        style={{ zIndex: zIndex + 1, ...style }}
        className={cn(
          'fixed inset-y-0 flex h-full w-full flex-col bg-popover text-sm text-popover-foreground shadow-2xl transition-[max-width] duration-200 sm:max-w-md',
          side === 'right' ? 'right-0 border-s border-border' : 'left-0 border-e border-border',
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Đóng"
            className="absolute top-3 end-3"
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex flex-col gap-0.5 p-4 pe-12', className)}
      {...props}
    />
  );
}

export function SheetTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      data-slot="sheet-title"
      className={cn('font-heading text-base font-semibold text-foreground', className)}
      {...props}
    />
  );
}

export function SheetDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="sheet-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn('mt-auto flex flex-col gap-2 p-4', className)}
      {...props}
    />
  );
}
