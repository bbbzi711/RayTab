import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectProps extends React.ComponentProps<'select'> {
  containerClassName?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, containerClassName, children, disabled, ...props }, ref) => {
    return (
      <div className={cn('relative inline-flex items-center w-full min-w-0', containerClassName)}>
        <select
          ref={ref}
          disabled={disabled}
          className={cn(
            'h-9 w-full appearance-none rounded-xl border border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/5 pl-3 pr-8 py-1.5 text-xs text-foreground transition-all outline-none cursor-pointer',
            'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
            'disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          size={14}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-50 text-foreground shrink-0"
        />
      </div>
    );
  },
);
Select.displayName = 'Select';

export { Select };
