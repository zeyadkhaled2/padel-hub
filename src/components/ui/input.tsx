import type * as React from 'react';
import { cn } from '@/lib/utils';

export function Input({
  className,
  type,
  ...props
}: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex min-h-[44px] w-full min-w-0 rounded-[11px] border border-input bg-muted px-3.5 py-2 text-[14px] sm:text-[14.5px] font-medium text-foreground transition-colors placeholder:text-muted-foreground/85 hover:border-border-strong focus-visible:border-brand focus-visible:bg-card focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
