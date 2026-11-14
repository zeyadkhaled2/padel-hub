import type { ReactNode } from 'react';

interface SectionHeaderProps {
  id?: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function SectionHeader({
  id,
  eyebrow,
  title,
  subtitle,
  action,
}: SectionHeaderProps) {
  return (
    <div className="section-heading">
      <div className="section-heading-copy">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 id={id}>{title}</h2>
        {subtitle ? <p className="section-subtitle">{subtitle}</p> : null}
      </div>
      {action ? <div className="section-heading-action">{action}</div> : null}
    </div>
  );
}
