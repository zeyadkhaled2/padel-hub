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
    <div className="section-heading">
      <div className="section-heading-copy">
        <h2 id={id}>{title}</h2>
        {subtitle ? <p className="section-subtitle">{subtitle}</p> : null}
      </div>
      {action ? <div className="section-heading-action">{action}</div> : null}
    </div>
  );
}
