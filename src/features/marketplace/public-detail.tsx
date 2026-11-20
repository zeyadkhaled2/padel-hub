/* eslint-disable @next/next/no-img-element -- Protected photos must not enter the shared optimizer. */
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { ViewTracker } from '@/features/analytics/view-tracker';
import { ReportForm } from '@/features/reports/forms';
import { formatAmount } from '@/lib/format';
import { publicListing } from './public-data';
import { getPublicListingDetailSections } from './search';

export async function PublicDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lookup = await publicListing(id);
  const t = await getTranslations('buyer');
  const e = await getTranslations('listingEditor');
  const market = await getTranslations('market');
  const account = await getTranslations('account');
  const locale = await getLocale();

  if (lookup.status === 'unavailable') {
    return (
      <main id="main" className="container detail-page">
        <p role="alert">{t('unavailable')}</p>
        <Link href="/">{market('back')}</Link>
      </main>
    );
  }
  if (lookup.status === 'not_found') notFound();

  const { listing } = lookup;
  const detailSections = getPublicListingDetailSections(listing);

  return (
    <main id="main" className="container detail-page">
      <ViewTracker id={id} />
      <Link href="/">{market('back')}</Link>
      <div className="detail-grid">
        <section aria-label={t('gallery')} className="public-gallery">
          {listing.media_ids.map((media, index) => (
            <img
              key={media}
              src={`/api/media/${media}?listing=${id}&variant=full`}
              alt={t('photo', { title: listing.title, number: index + 1 })}
              width={800}
              height={600}
              loading={index === 0 ? 'eager' : 'lazy'}
            />
          ))}
        </section>
        <section>
          <p className="condition">
            {e(listing.status)} · {e(listing.condition)} · {e(listing.offer_type)}
          </p>
          <h1>
            <bdi>{listing.title}</bdi>
          </h1>
          <p>
            {account(`governorates.${listing.governorate_slug}`)}
            {listing.district_text && <bdi> · {listing.district_text}</bdi>}
          </p>
          <p className="price">
            {listing.price_egp === null
              ? e('swap')
              : market('price', { amount: formatAmount(listing.price_egp, locale) })}
          </p>
          {listing.is_negotiable && <p>{e('is_negotiable')}</p>}
          <p>
            <strong>{e('brand_slug')}: </strong>
            <bdi>{listing.brand_custom || listing.brand_slug}</bdi>
          </p>
          {detailSections.map(({ key, value }) => (
            <div className="disclosure" key={key}>
              <h2>{e(key)}</h2>
              <p className="user-copy">
                <bdi>{value}</bdi>
              </p>
            </div>
          ))}
          <div className="disclosure">
            <h2>{t('seller')}</h2>
            <p>
              <bdi>
                {listing.seller.display_name} · @{listing.seller.username}
              </bdi>
            </p>
            <p>{t(listing.seller.account_type)}</p>
          </div>
          <p>
            {listing.last_confirmed_available_at
              ? t('confirmed', {
                  date: new Intl.DateTimeFormat(locale, {
                    dateStyle: 'medium',
                    timeZone: 'Africa/Cairo',
                  }).format(new Date(listing.last_confirmed_available_at)),
                })
              : t('confirmHint')}
          </p>
          {listing.status === 'active' ? (
            <a className="button primary" href={`/api/contact/${id}?locale=${locale}`} rel="nofollow">
              {t('whatsapp')}
            </a>
          ) : (
            <p className="form-notice">{t('noContact')}</p>
          )}
          <p className="field-hint">{t('safety')}</p>
          <ReportForm type="listing" target={id} />
        </section>
      </div>
    </main>
  );
}
