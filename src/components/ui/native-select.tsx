import type * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface NativeSelectProps
  extends Omit<React.ComponentProps<'select'>, 'size'> {
  size?: 'sm' | 'default';
  leadingIcon?: React.ReactNode;
  wrapperClassName?: string;
}

export function NativeSelect({
  className,
  wrapperClassName,
  size = 'default',
  leadingIcon,
  children,
  ...props
}: NativeSelectProps) {
  return (
    <span
      data-slot="native-select-wrapper"
      className={cn(
        'relative inline-flex w-full min-w-0 items-center',
        wrapperClassName,
      )}
    >
      {leadingIcon ? (
        <span
          className="pointer-events-none absolute start-2.5 sm:start-3 z-10 inline-flex items-center text-muted-foreground"
          aria-hidden="true"
        >
          {leadingIcon}
        </span>
      ) : null}

      <select
        data-slot="native-select"
        data-size={size}
        className={cn(
          'w-full min-w-0 cursor-pointer appearance-none truncate border border-input font-semibold text-foreground transition-colors hover:border-border-strong focus:border-foreground disabled:pointer-events-none disabled:opacity-65',
          size === 'sm'
            ? 'min-h-[36px] rounded-[7px] bg-card pe-7 text-[12.5px] sm:text-[13px]'
            : 'min-h-[42px] rounded-[8px] bg-muted py-2 pe-8 text-[13px] sm:text-[13.5px] focus:bg-card',
          leadingIcon
            ? size === 'sm'
              ? 'ps-8'
              : 'ps-8.5'
            : 'ps-3.5',
          className,
        )}
        {...props}
      >
        {children}
      </select>

      <ChevronDown
        size={size === 'sm' ? 14 : 15}
        className="pointer-events-none absolute end-2.5 text-muted-foreground"
        aria-hidden="true"
      />
    </span>
  );
}

export function NativeSelectOption({
  ...props
}: React.ComponentProps<'option'>) {
  return <option data-slot="native-select-option" {...props} />;
}
