import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { PAGE_SIZE } from '@/lib/domain/equipment';
import { filterDemoListings } from './demo-data';
import { ListingCard } from './listing-card';
import { PublicCard } from './public-card';
import { searchPublic } from './public-data';
import type { MarketplaceSearchValues } from './types';

export async function MarketplaceResults({ values, demo }: { values: MarketplaceSearchValues; demo: boolean }) {
  const tBuyer = await getTranslations('buyer');
  const tMarket = await getTranslations('market');
  const { q: query, category, sort } = values;
  const listings = demo ? filterDemoListings(query, category, sort) : [];
  const result = demo ? null : await searchPublic(values);
  const page = Number(values.page) || 1;
  const pageLink = (next: number) => ({
    pathname: '/',
    query: { ...values, page: String(next) },
    hash: 'equipment-heading',
  });

  return (
    <section className="market-section" aria-labelledby="equipment-heading">
      <div className="section-heading">
        <div>
          <h2 id="equipment-heading">{tMarket('heading')}</h2>
          <p>
            {demo ? tMarket('subheading') : tBuyer('subheading')} ·{' '}
            <span className="demo-inline-note">
              {demo ? tMarket('demo') : tBuyer('approvedOnly')}
            </span>
          </p>
        </div>
        <span className="result-count">
          {tMarket('count', { count: result?.total ?? listings.length })}
        </span>
      </div>

      {result && result.status !== 'ok' ? (
        <p role="alert" className="form-notice">
          {tBuyer(result.status === 'invalid' ? 'invalidSearch' : 'unavailable')}
        </p>
      ) : result && result.items.length > 0 ? (
        <div className="listing-grid">
          {result.items.map((listing) => (
            <PublicCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : listings.length > 0 ? (
        <div className="listing-grid">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h3>{tMarket('empty')}</h3>
          <p>{demo ? tMarket('emptyHint') : tBuyer('emptyHint')}</p>
          <Link href={demo ? '/demo' : '/'} className="button primary">
            {tMarket('reset')}
          </Link>
        </div>
      )}

      {result && result.status === 'ok' && result.total > PAGE_SIZE && (
        <nav className="category-links" aria-label={tBuyer('pages')}>
          {page > 1 && (
            <Link prefetch={false} href={pageLink(page - 1)} className="button secondary">
              {tBuyer('previous')}
            </Link>
          )}
          <span>{tBuyer('page', { page, pages: Math.ceil(result.total / PAGE_SIZE) })}</span>
          {page * PAGE_SIZE < result.total && (
            <Link prefetch={false} href={pageLink(page + 1)} className="button secondary">
              {tBuyer('next')}
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}
