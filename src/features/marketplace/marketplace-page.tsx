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
import { PublicCard } from './public-card';
import { searchPublic, searchValues } from './public-data';

type Query = Record<string, string | string[] | undefined>;

const readStringParam = (paramValue: Query[string]): string =>
  typeof paramValue === 'string' ? paramValue : '';

export async function MarketplacePage({
  searchParams, demo = false,
}: {
  searchParams: Promise<Query>; demo?: boolean;
}) {
  const tBuyer = await getTranslations('buyer');
  const tMarket = await getTranslations('market');
  const tInspection = await getTranslations('marketing.inspection');

  const params = await searchParams;
  const query = readStringParam(params.q);
  const category = readStringParam(params.category);
  const sort = readStringParam(params.sort);

  const listings = demo ? filterDemoListings(query, category, sort) : [];
  const values = searchValues(params);
  const result = demo ? null : await searchPublic(values);
  const page = Number(values.page) || 1;
  const pageLink = (next: number) => ({ pathname: '/', query: { ...values, page: String(next) }, hash: 'equipment-heading' });

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

      <SearchPanel query={query} category={category} sort={sort} values={demo ? undefined : values} />

      <CategoryPills query={query} category={category} sort={sort} base={demo ? "/demo" : "/"} values={values} />

      <section
        className="market-section"
        aria-labelledby="equipment-heading"
      >
        <div className="section-heading">
          <div>
            <h2 id="equipment-heading">{tMarket('heading')}</h2>
            <p>
              {demo ? tMarket('subheading') : tBuyer('subheading')} ·{' '}
              <span className="demo-inline-note">{demo ? tMarket('demo') : tBuyer('approvedOnly')}</span>
            </p>
          </div>
          <span className="result-count">
            {tMarket('count', { count: result?.total ?? listings.length })}
          </span>
        </div>

        {result?.unavailable || result?.invalid ? <p role="alert" className="form-notice">{tBuyer(result.invalid ? 'invalidSearch' : 'unavailable')}</p> : result && result.items.length > 0 ? <div className="listing-grid">{result.items.map(listing => <PublicCard key={listing.id} listing={listing} />)}</div> : listings.length > 0 ? (
          <div className="listing-grid">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>{tMarket('empty')}</h3>
            <p>{demo ? tMarket('emptyHint') : tBuyer('emptyHint')}</p>
            <Link href={demo ? "/demo" : "/"} className="button primary">
              {tMarket('reset')}
            </Link>
          </div>
        )}
        {result && result.total > 24 && <nav className="category-links" aria-label={tBuyer('pages')}>
          {page > 1 && <Link prefetch={false} href={pageLink(page-1)} className="button secondary">{tBuyer('previous')}</Link>}
          <span>{tBuyer('page', { page, pages: Math.ceil(result.total/24) })}</span>
          {page*24 < result.total && <Link prefetch={false} href={pageLink(page+1)} className="button secondary">{tBuyer('next')}</Link>}
        </nav>}
      </section>

      <InspectionShowcase
        title={tInspection('title')}
        subtitle={tInspection('subtitle')}
        illustrationAlt={tMarket('illustration')}
        items={inspectionItems}
      />

      <FeaturesSection />

      <HowItWorksSection />

      <FaqSection demo={demo} />

      <CommunityCtaSection />
    </main>
  );
}
