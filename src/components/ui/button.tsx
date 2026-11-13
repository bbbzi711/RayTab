import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import { Slot } from 'radix-ui';

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[background-color,color,border-color,box-shadow,opacity,transform] cursor-pointer outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[var(--ui-icon-action)] active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs',
        destructive:
          'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 shadow-xs',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-xs',
        ghost: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        navigation:
          'text-[color:var(--navigation-text,var(--preferences-muted))] hover:bg-[var(--navigation-hover,var(--preferences-field))] hover:text-[color:var(--navigation-hover-text,var(--preferences-text))] aria-pressed:bg-[var(--navigation-selection,var(--preferences-selection))] aria-pressed:text-[color:var(--navigation-selected-text,var(--preferences-accent))] aria-pressed:font-semibold',
        tab: 'text-muted-foreground hover:bg-accent/60 hover:text-foreground aria-selected:bg-[var(--preferences-selection)] aria-selected:text-[color:var(--preferences-accent)]',
        choice:
          'border border-input bg-background text-muted-foreground hover:border-ring/50 aria-pressed:border-ring aria-pressed:bg-accent aria-pressed:text-accent-foreground',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        xs: "h-6 gap-1 rounded-sm px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 gap-1.5 rounded-sm px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-xs': "size-6 rounded-sm [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8 rounded-sm',
        'icon-lg': 'size-10 rounded-md',
        navigation: 'h-auto min-h-11 justify-start gap-2.5 rounded-lg px-2.5 py-2 text-[13px]',
        'form-action': 'h-auto min-h-8 gap-1.5 rounded-sm px-3 py-1.5 whitespace-normal text-left',
        rail: 'h-14 w-full min-w-0 flex-col gap-1 rounded-none px-1 py-1.5 text-[11px] leading-tight',
        'rail-action': 'h-11 w-full rounded-none px-1',
        choice: 'h-auto flex-col gap-2 rounded-lg px-2 py-2.5 text-xs',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
