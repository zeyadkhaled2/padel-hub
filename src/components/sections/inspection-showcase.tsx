'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ShieldCheck, Layers, PackageCheck } from 'lucide-react';

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
  artLabel: string;
  illustrationAlt: string;
  items: InspectionTabItem[];
}

export function InspectionShowcase({
  title,
  subtitle,
  artLabel,
  illustrationAlt,
  items,
}: InspectionShowcaseProps) {
  const [activeId, setActiveId] = useState<InspectionTabItem['id']>('face');
  const activeItem = items.find((item) => item.id === activeId) ?? items[0];

  const renderIcon = (id: InspectionTabItem['id']) => {
    if (id === 'face') return <Layers size={18} aria-hidden />;
    if (id === 'frame') return <ShieldCheck size={18} aria-hidden />;
    return <PackageCheck size={18} aria-hidden />;
  };

  return (
    <section
      className="inspection-section"
      aria-labelledby="inspection-heading"
    >
      <div className="inspection-header">
        <h2 id="inspection-heading">{title}</h2>
        <p className="inspection-subtitle">{subtitle}</p>
      </div>

      <div className="inspection-grid">
        <div
          className="inspection-tabs"
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
                className={`inspection-tab ${isSelected ? 'active' : ''}`}
                onClick={() => setActiveId(item.id)}
              >
                <span className="inspection-tab-icon">
                  {renderIcon(item.id)}
                </span>
                <span className="inspection-tab-copy">
                  <strong>{item.tabLabel}</strong>
                  <span>{item.meta}</span>
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
          className="inspection-stage"
        >
          <div className="inspection-visual">
            <Image
              src={activeItem.imageSrc}
              alt={illustrationAlt}
              fill
              sizes="(max-width: 700px) 100vw, 50vw"
            />
            <span className="art-label">{artLabel}</span>
          </div>

          <div className="inspection-stage-body">
            <span className="condition">{activeItem.meta}</span>
            <h3>{activeItem.title}</h3>
            <p>{activeItem.body}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
