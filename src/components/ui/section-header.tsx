import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  id?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export function SectionHeader({
  id,
  title,
  subtitle,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        'mb-7 md:mb-9 flex flex-wrap items-end justify-between gap-4',
        className,
      )}
    >
      <div className="max-w-[660px]">
        <h2
          id={id}
          className="font-display text-[clamp(1.55rem,2.8vw,2.15rem)] font-extrabold leading-[1.14] tracking-[-0.025em] text-foreground"
        >
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-2.5 text-[15px] sm:text-[16px] leading-[1.6] text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
