'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Layers, PackageCheck, ShieldCheck } from 'lucide-react';

export interface InspectionTabItem {
  id: 'face' | 'frame' | 'balls';
  tabLabel: string;
  title: string;
  body: string;
  meta: string;
  imageSrc: string;
}

interface InspectionShowcaseProps {
  title: string;
  subtitle: string;
  illustrationAlt: string;
  items: InspectionTabItem[];
}

export function InspectionShowcase({
  title,
  subtitle,
  illustrationAlt,
  items,
}: InspectionShowcaseProps) {
  const [activeId, setActiveId] = useState<InspectionTabItem['id']>('face');
  const activeItem = items.find((item) => item.id === activeId) ?? items[0];

  const renderIcon = (id: InspectionTabItem['id']) => {
    if (id === 'face') return <Layers size={18} aria-hidden="true" />;
    if (id === 'frame') return <ShieldCheck size={18} aria-hidden="true" />;
    return <PackageCheck size={18} aria-hidden="true" />;
  };

  return (
    <section
      className="my-12 md:my-20 overflow-hidden rounded-[20px] border border-line bg-surface p-5 sm:p-8 md:p-9"
      aria-labelledby="inspection-heading"
    >
      <div className="max-w-[680px]">
        <h2
          id="inspection-heading"
          className="font-display text-[clamp(1.5rem,2.8vw,2.15rem)] font-extrabold leading-[1.14] tracking-[-0.025em] text-ink"
        >
          {title}
        </h2>
        <p className="mt-2.5 text-[14.5px] sm:text-[15.5px] leading-[1.6] text-muted">
          {subtitle}
        </p>
      </div>

      <div className="mt-6 md:mt-8 grid grid-cols-1 items-stretch gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.2fr)] lg:gap-7">
        <div
          className="flex flex-col gap-3"
          role="tablist"
          aria-labelledby="inspection-heading"
        >
          {items.map((item) => {
            const isSelected = item.id === activeItem.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`inspection-tab-${item.id}`}
                aria-selected={isSelected}
                aria-controls={`inspection-panel-${item.id}`}
                className={`group flex w-full flex-1 min-h-[64px] items-center gap-4 rounded-[14px] border p-4 sm:p-5 text-start transition-colors duration-200 ${
                  isSelected
                    ? 'border-accent/45 bg-surface-soft text-ink'
                    : 'border-line bg-surface-subtle/70 text-ink hover:border-line-strong hover:bg-surface-subtle'
                }`}
                onClick={() => setActiveId(item.id)}
              >
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-[10px] transition-colors ${
                    isSelected
                      ? 'bg-action text-action-ink'
                      : 'bg-surface text-accent border border-line/80'
                  }`}
                >
                  {renderIcon(item.id)}
                </span>
                <span className="grid min-w-0 gap-1">
                  <strong className="font-display text-[15px] sm:text-[16px] font-bold leading-snug text-ink">
                    {item.tabLabel}
                  </strong>
                  <span className="text-[12.5px] sm:text-[13px] leading-snug text-muted">
                    {item.meta}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div
          key={activeItem.id}
          role="tabpanel"
          id={`inspection-panel-${activeItem.id}`}
          aria-labelledby={`inspection-tab-${activeItem.id}`}
          className="flex flex-col overflow-hidden rounded-[16px] border border-line bg-surface-subtle/60"
        >
          <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface-subtle">
            <Image
              src={activeItem.imageSrc}
              alt={illustrationAlt}
              fill
              sizes="(max-width: 1023px) 100vw, 52vw"
              className="object-cover"
            />
          </div>

          <div className="flex flex-1 flex-col justify-center p-5 sm:p-6">
            <span className="w-fit rounded-[7px] bg-gold-soft px-2.5 py-1 text-[11.5px] font-bold leading-none text-ink">
              {activeItem.meta}
            </span>
            <h3 className="mt-3 font-display text-[19px] sm:text-[21px] font-bold text-ink">
              {activeItem.title}
            </h3>
            <p className="mt-1.5 text-[14.5px] sm:text-[15px] leading-[1.6] text-muted">
              {activeItem.body}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
