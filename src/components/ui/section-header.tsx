import type { ReactNode } from 'react';

interface SectionHeaderProps {
  id?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function SectionHeader({
  id,
  title,
  subtitle,
  action,
}: SectionHeaderProps) {
  return (
    <div className="mb-7 md:mb-9 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-[660px]">
        <h2
          id={id}
          className="font-display text-[clamp(1.55rem,2.8vw,2.15rem)] font-extrabold leading-[1.14] tracking-[-0.025em] text-ink"
        >
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-2.5 text-[15px] sm:text-[16px] leading-[1.6] text-muted">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
