import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
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
    <main id="main" className="container">
      <HeroSection />

      <section
        aria-label={tMarket('search')}
        className="relative z-20 -mt-5 sm:-mt-5.5 md:-mt-6 mx-1.5 sm:mx-3 md:mx-5 rounded-[16px] border border-line bg-surface p-3 sm:p-3.5 md:p-4 shadow-[var(--shadow-dock)]"
      >
        <SearchPanel query={query} category={category} sort={sort} />

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-line/80 pt-2.5">
          <CategoryPills
            query={query}
            category={category}
            sort={sort}
            counts={categoryCounts}
          />

          {hasActiveFilters && listings.length > 0 ? (
            <Link
              href="/"
              className="inline-flex min-h-[38px] items-center rounded-[10px] px-3 text-[12.5px] font-semibold text-muted transition-colors hover:bg-surface-subtle hover:text-accent"
            >
              {tMarket('reset')}
            </Link>
          ) : null}
        </div>
      </section>

      <section
        className="mt-5 mb-12 md:mt-7 md:mb-16"
        aria-labelledby="equipment-heading"
      >
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="equipment-heading"
              className="scroll-mt-32 md:scroll-mt-24 font-display text-[21px] md:text-[25px] font-extrabold tracking-[-0.025em] text-ink"
            >
              {tMarket('heading')}
            </h2>
            <p className="mt-0.5 text-[13.5px] sm:text-[14px] leading-snug text-muted">
              {tMarket('subheading')}{' '}
              <span aria-hidden="true" className="text-line-strong">
                ·
              </span>{' '}
              <span className="font-semibold text-accent">
                {tMarket('demo')}
              </span>
            </p>
          </div>
          <span className="whitespace-nowrap rounded-[9px] border border-line bg-surface px-3 py-1 font-display text-[12.5px] font-bold tabular-nums text-muted">
            {tMarket('count', { count: listings.length })}
          </span>
        </div>

        {listings.length > 0 ? (
          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 md:gap-5">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        ) : (
          <div className="rounded-[16px] border border-line bg-surface px-6 py-12 text-center">
            <h3 className="font-display text-[20px] font-bold text-ink">
              {tMarket('empty')}
            </h3>
            <p className="mt-2 mb-6 text-[14.5px] text-muted">
              {tMarket('emptyHint')}
            </p>
            <Link
              href="/"
              className="inline-flex min-h-[44px] items-center justify-center rounded-[11px] bg-action px-5.5 py-2.5 text-[14px] font-bold text-action-ink transition-colors duration-200 hover:bg-action-hover"
            >
              {tMarket('reset')}
            </Link>
          </div>
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
    </main>
  );
}
