import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { HeroSection } from '@/components/sections/hero-section';
import {
  InspectionShowcase,
  type InspectionTabItem,
} from '@/components/sections/inspection-showcase';
import { FeaturesSection } from '@/components/sections/features-section';
import { HowItWorksSection } from '@/components/sections/how-it-works-section';
import { FaqSection } from '@/components/sections/faq-section';
import { CommunityCtaSection } from '@/components/sections/community-cta-section';
import { SearchPanel } from './search-panel';
import { CategoryPills } from './category-pills';
import { MarketplaceResults } from './marketplace-results';
import { ProductGridSkeleton } from './product-grid-skeleton';
import { searchValues, type Query } from './public-data';

export async function MarketplacePage({
  searchParams,
  demo = false,
}: {
  searchParams: Promise<Query>;
  demo?: boolean;
}) {
  const tBuyer = await getTranslations('buyer');
  const tMarket = await getTranslations('market');
  const tInspection = await getTranslations('marketing.inspection');

  const params = await searchParams;
  const values = searchValues(params);
  const { q: query, category, sort } = values;

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

      <SearchPanel
        query={query}
        category={category}
        sort={sort}
        values={demo ? undefined : values}
        base={demo ? '/demo' : '/'}
      />

      <CategoryPills
        query={query}
        category={category}
        sort={sort}
        base={demo ? '/demo' : '/'}
        values={values}
      />

      <Suspense
        key={JSON.stringify({ values, demo })}
        fallback={
          <ProductGridSkeleton
            heading={tMarket('heading')}
            description={demo ? tMarket('subheading') : tBuyer('subheading')}
            note={demo ? tMarket('demo') : tBuyer('approvedOnly')}
            loadingLabel={tMarket('loading')}
          />
        }
      >
        <MarketplaceResults values={values} demo={demo} />
      </Suspense>

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
