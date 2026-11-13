import { getTranslations } from 'next-intl/server';
import { Search, SlidersHorizontal, HeartHandshake, ArrowUpRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { ListingCard } from '@/features/marketplace/listing-card';
import { filterDemoListings } from '@/features/marketplace/demo-data';

type Query = Record<string, string | string[] | undefined>;
const value = (v: Query[string]) => typeof v === 'string' ? v : '';

export default async function MarketplacePage({ searchParams }: { searchParams: Promise<Query> }) {
  const t = await getTranslations('market');
  const params = await searchParams;
  const q = value(params.q), category = value(params.category), sort = value(params.sort);
  const listings = filterDemoListings(q, category, sort);
  return <main id="main" className="container">
    <section className="hero"><div className="hero-copy"><p className="eyebrow"><span className="tiny-ball" />{t('eyebrow')}</p><h1>{t('title')}</h1><p className="hero-intro">{t('intro')}</p><span className="community-note"><HeartHandshake size={19} aria-hidden />{t('badge')}</span></div>
      <div className="hero-court" aria-hidden><div className="court-mark" /><div className="hero-ball" /><span>meet. play. repeat.</span></div>
    </section>
    <form className="search-panel" role="search"><div className="search-row"><label className="search-field"><span>{t('search')}</span><div><Search size={21} aria-hidden /><input name="q" defaultValue={q} placeholder={t('placeholder')} /></div></label><button className="button primary" type="submit">{t('submit')}<ArrowUpRight size={18} aria-hidden /></button></div>
      <details className="filters" open={Boolean(category || sort)}><summary><SlidersHorizontal size={16} aria-hidden />{t('filters')}</summary><div className="filter-fields"><label>{t('category')}<select name="category" defaultValue={category}><option value="">{t('all')}</option><option value="rackets">{t('rackets')}</option><option value="balls">{t('balls')}</option></select></label><label>{t('sort')}<select name="sort" defaultValue={sort}><option value="">{t('newest')}</option><option value="low">{t('low')}</option><option value="high">{t('high')}</option></select></label></div></details>
    </form>
    <section className="market-section" aria-labelledby="equipment-heading"><div className="section-heading"><div><p className="eyebrow">{t('demo')}</p><h2 id="equipment-heading">{t('heading')}</h2><p>{t('subheading')}</p></div><span className="result-count">{t('count', { count: listings.length })}</span></div>
      {listings.length ? <div className="listing-grid">{listings.map(listing => <ListingCard key={listing.id} listing={listing} />)}</div> : <div className="empty-state"><h3>{t('empty')}</h3><p>{t('emptyHint')}</p><Link href="/" className="button primary">{t('reset')}</Link></div>}
    </section>
    <aside className="community-banner"><HeartHandshake size={32} aria-hidden /><div><h2>{t('tipTitle')}</h2><p>{t('tip')}</p></div><Link href="/about" className="text-link">{t('learn')}<ArrowUpRight size={18} aria-hidden /></Link></aside>
  </main>;
}
