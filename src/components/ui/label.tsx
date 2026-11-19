import type * as React from 'react';
import { cn } from '@/lib/utils';

export function Label({
  className,
  ...props
}: React.ComponentProps<'label'>) {
  return (
    <label
      data-slot="label"
      className={cn(
        'text-[11.5px] font-semibold tracking-[-0.01em] text-muted-foreground select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
