import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  size?: 'sm' | 'default';
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    {
      className,
      checked,
      defaultChecked = false,
      onCheckedChange,
      size = 'default',
      disabled,
      onClick,
      ...props
    },
    ref
  ) => {
    const [uncontrolled, setUncontrolled] = React.useState(defaultChecked);
    const isControlled = checked !== undefined;
    const isChecked = isControlled ? checked : uncontrolled;

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (event.defaultPrevented || disabled) return;
      const next = !isChecked;
      if (!isControlled) setUncontrolled(next);
      onCheckedChange?.(next);
    };

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={isChecked}
        data-slot="switch"
        data-size={size}
        data-state={isChecked ? 'checked' : 'unchecked'}
        disabled={disabled}
        onClick={handleClick}
        className={cn(
          'peer group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
          size === 'sm' ? 'h-4 w-7' : 'h-5 w-9',
          isChecked ? 'bg-primary' : 'bg-input dark:bg-input/80',
          className
        )}
        {...props}
      >
        <span
          data-slot="switch-thumb"
          className={cn(
            'pointer-events-none block rounded-full bg-background shadow-xs ring-0 transition-transform',
            size === 'sm' ? 'size-3' : 'size-4',
            isChecked
              ? size === 'sm'
                ? 'translate-x-3.5 dark:bg-primary-foreground'
                : 'translate-x-4.5 dark:bg-primary-foreground'
              : 'translate-x-0.5 dark:bg-foreground'
          )}
        />
      </button>
    );
  }
);
Switch.displayName = 'Switch';
