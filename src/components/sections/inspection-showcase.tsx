'use client';

import Image from 'next/image';
import { Layers, PackageCheck, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
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
    if (id === 'face') return <Layers size={18} aria-hidden="true" />;
    if (id === 'frame') return <ShieldCheck size={18} aria-hidden="true" />;
    return <PackageCheck size={18} aria-hidden="true" />;
  };

  return (
    <section className="my-12 md:my-20" aria-labelledby="inspection-heading">
      <Card className="overflow-hidden rounded-[20px] p-5 sm:p-8 md:p-9">
        <div className="max-w-[680px]">
          <h2
            id="inspection-heading"
            className="font-display text-[clamp(1.5rem,2.8vw,2.15rem)] font-extrabold leading-[1.14] tracking-[-0.025em] text-foreground"
          >
            {title}
          </h2>
          <p className="mt-2.5 text-[14.5px] sm:text-[15.5px] leading-[1.6] text-muted-foreground">
            {subtitle}
          </p>
        </div>

        <Tabs
          defaultValue={items[0]?.id ?? 'face'}
          orientation="vertical"
          className="mt-6 md:mt-8 grid grid-cols-1 items-stretch gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.2fr)] lg:gap-7"
        >
          <TabsList
            aria-labelledby="inspection-heading"
            className="flex h-auto flex-col items-stretch justify-start gap-3 bg-transparent p-0"
          >
            {items.map((item) => (
              <TabsTrigger
                key={item.id}
                value={item.id}
                className="group flex w-full flex-1 min-h-[64px] items-center justify-start gap-4 rounded-[14px] border border-border bg-muted/70 p-4 sm:p-5 text-start text-foreground hover:border-border-strong hover:bg-muted data-[state=active]:border-brand/45 data-[state=active]:bg-accent"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-border/80 bg-card text-brand transition-colors group-data-[state=active]:border-transparent group-data-[state=active]:bg-primary group-data-[state=active]:text-primary-foreground">
                  {renderIcon(item.id)}
                </span>
                <span className="grid min-w-0 flex-1 gap-1 text-start">
                  <strong className="font-display text-[15px] sm:text-[16px] font-bold leading-snug text-foreground">
                    {item.tabLabel}
                  </strong>
                  <span className="text-[12.5px] sm:text-[13px] font-medium leading-snug text-muted-foreground">
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
              className="mt-0 flex flex-col overflow-hidden rounded-[16px] border border-border bg-muted/60"
            >
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
                <Image
                  src={item.imageSrc}
                  alt={illustrationAlt}
                  fill
                  sizes="(max-width: 1023px) 100vw, 52vw"
                  className="object-cover"
                />
              </div>

              <div className="flex flex-1 flex-col justify-center p-5 sm:p-6">
                <Badge variant="goldSoft">{item.meta}</Badge>
                <h3 className="mt-3 font-display text-[19px] sm:text-[21px] font-bold text-foreground">
                  {item.title}
                </h3>
                <p className="mt-1.5 text-[14.5px] sm:text-[15px] leading-[1.6] text-muted-foreground">
                  {item.body}
                </p>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </Card>
    </section>
  );
}
