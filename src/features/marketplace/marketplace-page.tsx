import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { HeroSection } from '@/components/sections/hero-section';
import {
  InspectionShowcase,
  type InspectionTabItem,
} from '@/components/sections/inspection-showcase';
import { FeaturesSection } from '@/components/sections/features-section';
import { HowItWorksSection } from '@/components/sections/how-it-works-section';
import { FaqSection } from '@/components/sections/faq-section';
import { CommunityCtaSection } from '@/components/sections/community-cta-section';
import { filterDemoListings } from './demo-data';
import { SearchPanel } from './search-panel';
import { CategoryPills } from './category-pills';
import { ListingCard } from './listing-card';

type Query = Record<string, string | string[] | undefined>;

const readStringParam = (paramValue: Query[string]): string =>
  typeof paramValue === 'string' ? paramValue : '';

export async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const tMarket = await getTranslations('market');
  const tInspection = await getTranslations('marketing.inspection');

  const params = await searchParams;
  const query = readStringParam(params.q);
  const category = readStringParam(params.category);
  const sort = readStringParam(params.sort);

  const listings = filterDemoListings(query, category, sort);
  const queryScopedListings = filterDemoListings(query, '', '');
  const categoryCounts = {
    all: queryScopedListings.length,
    rackets: queryScopedListings.filter((item) => item.category === 'rackets')
      .length,
    balls: queryScopedListings.filter((item) => item.category === 'balls')
      .length,
  };
  const hasActiveFilters = Boolean(query || category || sort);

  const inspectionItems: InspectionTabItem[] = [
    {
      id: 'face',
      tabLabel: tInspection('tabFace'),
      title: tInspection('tabFaceTitle'),
      body: tInspection('tabFaceBody'),
      meta: tInspection('tabFaceMeta'),
      imageSrc: '/images/demo/racket-court.webp',
    },
    {
      id: 'frame',
      tabLabel: tInspection('tabFrame'),
      title: tInspection('tabFrameTitle'),
      body: tInspection('tabFrameBody'),
      meta: tInspection('tabFrameMeta'),
      imageSrc: '/images/demo/racket-coral.webp',
    },
    {
      id: 'balls',
      tabLabel: tInspection('tabBalls'),
      title: tInspection('tabBallsTitle'),
      body: tInspection('tabBallsBody'),
      meta: tInspection('tabBallsMeta'),
      imageSrc: '/images/demo/balls.webp',
    },
  ];

  return (
    <main id="main" className="w-full">
      {/* Top-performer commerce search & category utility strip (StockX / Vinted / KREAM pattern) */}
      <section
        aria-label={tMarket('search')}
        className="border-b border-border bg-background"
      >
        <div className="container py-2.5">
          <SearchPanel query={query} category={category} sort={sort} />

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-2">
            <CategoryPills
              query={query}
              category={category}
              sort={sort}
              counts={categoryCounts}
            />

            {hasActiveFilters && listings.length > 0 ? (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="px-2.5 text-[12.5px] font-semibold text-brand hover:text-brand"
              >
                <Link href="/">{tMarket('reset')}</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="container">
        <HeroSection />

        <section
          className="mt-5 mb-12 md:mt-5 md:mb-14"
          aria-labelledby="equipment-heading"
        >
          <div className="mb-3.5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                id="equipment-heading"
                className="scroll-mt-32 md:scroll-mt-24 font-display text-[20px] md:text-[24px] font-extrabold tracking-[-0.025em] text-foreground"
              >
                {tMarket('heading')}
              </h2>
              <p className="mt-0.5 text-[13px] sm:text-[13.5px] leading-snug text-muted-foreground">
                {tMarket('subheading')}{' '}
                <span aria-hidden="true" className="text-border-strong">
                  ·
                </span>{' '}
                <span className="font-semibold text-brand">
                  {tMarket('demo')}
                </span>
              </p>
            </div>
            <Badge
              variant="outline"
              className="rounded-[6px] px-2.5 py-1 font-display text-[12px] font-semibold tabular-nums text-muted-foreground"
            >
              {tMarket('count', { count: listings.length })}
            </Badge>
          </div>

          {listings.length > 0 ? (
            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 md:grid-cols-3 gap-3.5 sm:gap-4 md:gap-5">
              {listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          ) : (
            <Card className="items-center px-6 py-12 text-center">
              <h3 className="font-display text-[19px] font-bold text-foreground">
                {tMarket('empty')}
              </h3>
              <p className="mt-2 mb-5 text-[14px] text-muted-foreground">
                {tMarket('emptyHint')}
              </p>
              <Button asChild className="px-5">
                <Link href="/">{tMarket('reset')}</Link>
              </Button>
            </Card>
          )}
        </section>

        <InspectionShowcase
          title={tInspection('title')}
          subtitle={tInspection('subtitle')}
          illustrationAlt={tMarket('illustration')}
          items={inspectionItems}
        />

        <FeaturesSection />

        <HowItWorksSection />

        <FaqSection />

        <CommunityCtaSection />
      </div>
    </main>
  );
}
