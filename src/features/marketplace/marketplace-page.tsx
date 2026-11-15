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

      <SearchPanel query={query} category={category} sort={sort} />

      <CategoryPills query={query} category={category} sort={sort} />

      <section
        className="market-section"
        aria-labelledby="equipment-heading"
      >
        <div className="section-heading">
          <div>
            <h2 id="equipment-heading">{tMarket('heading')}</h2>
            <p>
              {tMarket('subheading')} ·{' '}
              <span className="demo-inline-note">{tMarket('demo')}</span>
            </p>
          </div>
          <span className="result-count">
            {tMarket('count', { count: listings.length })}
          </span>
        </div>

        {listings.length > 0 ? (
          <div className="listing-grid">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>{tMarket('empty')}</h3>
            <p>{tMarket('emptyHint')}</p>
            <Link href="/" className="button primary">
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
