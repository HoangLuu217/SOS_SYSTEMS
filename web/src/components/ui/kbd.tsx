import * as React from 'react';
import { cn } from '@/lib/utils';

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'pointer-events-none inline-flex h-5 min-w-5 items-center justify-center gap-1 rounded-sm border border-border bg-muted px-1 font-mono text-[11px] font-medium text-muted-foreground select-none',
        className
      )}
      {...props}
    />
  );
}

export function KbdGroup({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-slot="kbd-group"
      className={cn('inline-flex items-center gap-1', className)}
      {...props}
    />
  );
}
