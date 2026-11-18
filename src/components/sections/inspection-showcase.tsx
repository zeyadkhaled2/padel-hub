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
      className="courtside-showcase relative my-12 md:my-20 overflow-hidden rounded-[22px] md:rounded-[28px] p-5 sm:p-8 md:p-10 text-white shadow-[var(--shadow-dock)]"
      aria-labelledby="inspection-heading"
    >
      <div className="max-w-[680px]">
        <h2
          id="inspection-heading"
          className="font-display text-[clamp(1.55rem,2.9vw,2.2rem)] font-extrabold leading-[1.14] tracking-[-0.025em] text-white"
        >
          {title}
        </h2>
        <p className="mt-2.5 text-[14.5px] sm:text-[16px] leading-[1.6] text-[#c5d3ee]">
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
                className={`group flex w-full flex-1 min-h-[64px] items-center gap-4 rounded-[16px] p-4 sm:p-5 text-start transition-colors duration-200 ${
                  isSelected
                    ? 'bg-white/[0.14] text-white ring-1 ring-inset ring-hero/45'
                    : 'bg-white/[0.04] text-[#dbe5fa] hover:bg-white/[0.08] ring-1 ring-inset ring-white/[0.06]'
                }`}
                onClick={() => setActiveId(item.id)}
              >
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-[11px] transition-colors ${
                    isSelected
                      ? 'bg-hero text-hero-ink'
                      : 'bg-white/[0.09] text-hero group-hover:bg-white/[0.14]'
                  }`}
                >
                  {renderIcon(item.id)}
                </span>
                <span className="grid min-w-0 gap-1">
                  <strong className="font-display text-[15px] sm:text-[16px] font-bold leading-snug text-white">
                    {item.tabLabel}
                  </strong>
                  <span className="text-[12.5px] sm:text-[13px] leading-snug text-[#bdd0f2]">
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
          className="flex flex-col overflow-hidden rounded-[18px] bg-[#091228]/75"
        >
          <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#0e1b38]">
            <Image
              src={activeItem.imageSrc}
              alt={illustrationAlt}
              fill
              sizes="(max-width: 1023px) 100vw, 52vw"
              className="object-cover"
            />
          </div>

          <div className="flex flex-1 flex-col justify-center p-5 sm:p-6">
            <span className="w-fit rounded-[7px] bg-hero px-2.5 py-1 text-[11.5px] font-bold leading-none text-hero-ink">
              {activeItem.meta}
            </span>
            <h3 className="mt-3 font-display text-[19px] sm:text-[22px] font-bold text-white">
              {activeItem.title}
            </h3>
            <p className="mt-1.5 text-[14.5px] sm:text-[15px] leading-[1.6] text-[#c8d5ef]">
              {activeItem.body}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
