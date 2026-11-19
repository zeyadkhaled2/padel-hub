import type * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[8px] text-[14px] font-semibold transition-[background-color,border-color,color] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground font-bold hover:bg-primary-hover',
        destructive:
          'bg-destructive text-destructive-foreground font-bold hover:bg-destructive/90',
        outline:
          'border border-border bg-card text-foreground hover:border-border-strong hover:text-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost:
          'text-muted-foreground hover:bg-muted hover:text-foreground',
        soft:
          'bg-accent text-accent-foreground hover:bg-accent/85',
        link: 'text-brand underline-offset-4 hover:underline',
      },
      size: {
        default: 'min-h-[42px] px-4.5 py-2',
        sm: 'min-h-[36px] rounded-[7px] px-3 py-1.5 text-[13px]',
        lg: 'min-h-[46px] px-6 py-2.5 text-[14.5px]',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: ButtonProps) {
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

export { buttonVariants };
