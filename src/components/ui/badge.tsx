import type * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[5px] border px-2 py-1 text-[11px] font-bold leading-none tracking-[0.01em] transition-colors [&>svg]:pointer-events-none [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary:
          'border-transparent bg-muted text-muted-foreground font-semibold',
        outline: 'border-border bg-card text-foreground font-semibold',
        soft: 'border-transparent bg-accent text-accent-foreground',
        gold: 'border-transparent bg-court-gold text-court-gold-foreground',
        goldSoft: 'border-transparent bg-gold-soft text-accent-foreground',
        frosted:
          'border-border/80 bg-card/95 text-foreground backdrop-blur-sm',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.ComponentProps<'span'>,
    VariantProps<typeof badgeVariants> {
  asChild?: boolean;
}

export function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: BadgeProps) {
  const Comp = asChild ? Slot.Root : 'span';

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { badgeVariants };
