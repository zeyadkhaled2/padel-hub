'use client';

import Image from 'next/image';
import { Layers, PackageCheck, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
  const renderIcon = (id: InspectionTabItem['id']) => {
    if (id === 'face') return <Layers size={17} aria-hidden="true" />;
    if (id === 'frame') return <ShieldCheck size={17} aria-hidden="true" />;
    return <PackageCheck size={17} aria-hidden="true" />;
  };

  return (
    <section
      className="my-10 border-t border-border pt-10 md:my-14 md:pt-14"
      aria-labelledby="inspection-heading"
    >
      <div className="max-w-[660px]">
        <h2
          id="inspection-heading"
          className="font-display text-[clamp(1.45rem,2.6vw,2rem)] font-extrabold leading-[1.14] tracking-[-0.025em] text-foreground"
        >
          {title}
        </h2>
        <p className="mt-2 text-[14px] sm:text-[15px] leading-[1.6] text-muted-foreground">
          {subtitle}
        </p>
      </div>

      <Tabs
        defaultValue={items[0]?.id ?? 'face'}
        orientation="vertical"
        className="mt-6 grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.25fr)] lg:gap-6"
      >
        <TabsList
          aria-labelledby="inspection-heading"
          className="flex h-auto flex-col items-stretch justify-start gap-2.5 bg-transparent p-0"
        >
          {items.map((item) => (
            <TabsTrigger
              key={item.id}
              value={item.id}
              className="group flex w-full flex-1 min-h-[60px] items-center justify-start gap-3.5 rounded-[8px] border border-border bg-card p-3.5 sm:p-4 text-start text-foreground hover:border-border-strong hover:bg-muted/60 data-[state=active]:border-foreground data-[state=active]:bg-muted/70"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[7px] border border-border bg-muted text-brand transition-colors group-data-[state=active]:border-transparent group-data-[state=active]:bg-brand group-data-[state=active]:text-white dark:group-data-[state=active]:text-[#032114]">
                {renderIcon(item.id)}
              </span>
              <span className="grid min-w-0 flex-1 gap-0.5 text-start">
                <strong className="font-display text-[14.5px] sm:text-[15.5px] font-bold leading-snug text-foreground">
                  {item.tabLabel}
                </strong>
                <span className="text-[12px] sm:text-[12.5px] font-medium leading-snug text-muted-foreground">
                  {item.meta}
                </span>
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {items.map((item) => (
          <TabsContent
            key={item.id}
            value={item.id}
            className="mt-0 flex flex-col overflow-hidden rounded-[8px] border border-border bg-card"
          >
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
              <Image
                src={item.imageSrc}
                alt={illustrationAlt}
                fill
                decoding="async"
                sizes="(max-width: 1023px) 92vw, 620px"
                className="object-cover"
              />
            </div>

            <div className="flex flex-1 flex-col justify-center p-4 sm:p-5">
              <Badge variant="soft">{item.meta}</Badge>
              <h3 className="mt-2.5 font-display text-[18px] sm:text-[20px] font-bold text-foreground">
                {item.title}
              </h3>
              <p className="mt-1.5 text-[14px] sm:text-[14.5px] leading-[1.6] text-muted-foreground">
                {item.body}
              </p>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
