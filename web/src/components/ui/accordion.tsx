import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AccordionItemProps {
  value: string;
  trigger: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Accordion({
  items,
  defaultValue,
  className,
}: {
  items: AccordionItemProps[];
  defaultValue?: string;
  className?: string;
}) {
  const [openValue, setOpenValue] = React.useState<string | null>(defaultValue ?? items[0]?.value ?? null);

  return (
    <div data-slot="accordion" className={cn('flex flex-col gap-3', className)}>
      {items.map((item) => {
        const isOpen = openValue === item.value;
        return (
          <div
            key={item.value}
            data-slot="accordion-item"
            data-state={isOpen ? 'open' : 'closed'}
            className={cn(
              'rounded-xl border border-border bg-card px-5 shadow-(--surface-shadow) transition-colors',
              item.className
            )}
          >
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpenValue(isOpen ? null : item.value)}
              className="flex w-full items-center justify-between gap-3 py-4 text-left text-base font-medium text-foreground transition-colors hover:text-primary"
            >
              <span className="flex flex-1 items-center gap-3">{item.trigger}</span>
              <ChevronDown
                className={cn(
                  'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
                  isOpen && 'rotate-180 text-primary'
                )}
              />
            </button>
            {isOpen && (
              <div className="pb-4 pl-10 text-sm leading-relaxed text-muted-foreground">
                {item.children}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
