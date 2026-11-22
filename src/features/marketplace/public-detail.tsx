import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  MapPin,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { ViewTracker } from '@/features/analytics/view-tracker';
import { ReportForm } from '@/features/reports/forms';
import { formatBrandLabel } from '@/lib/domain/equipment';
import { formatAmount } from '@/lib/format';
import { MobileContactBar } from './mobile-contact-bar';
import { ProductGallery } from './product-gallery';
import { publicListing } from './public-data';
import { getPublicRacketSpecRows } from './search';

export async function PublicDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lookup = await publicListing(id);
  const t = await getTranslations('buyer');
  const e = await getTranslations('listingEditor');
  const market = await getTranslations('market');
  const account = await getTranslations('account');
  const reports = await getTranslations('reports');
  const locale = await getLocale();

  if (lookup.status === 'unavailable') {
    return (
      <main id="main" className="container detail-page">
        <div className="empty-state">
          <p role="alert">{t('unavailable')}</p>
          <Link href="/" className="button secondary">
            {market('back')}
          </Link>
        </div>
      </main>
    );
  }
  if (lookup.status === 'not_found') notFound();

  const { listing } = lookup;
  const racketSpecRows = getPublicRacketSpecRows(listing);
  const isActive = listing.status === 'active';
  const brandLabel = listing.brand_custom || formatBrandLabel(listing.brand_slug);
  const isCuratedBrand = !listing.brand_custom;
  const governorateLabel = account(`governorates.${listing.governorate_slug}`);
  const sellerInitial = listing.seller.display_name.trim().charAt(0).toUpperCase() || '@';

  const priceDisplay =
    listing.price_egp === null
      ? t('swapOnlyLabel')
      : market('price', { amount: formatAmount(listing.price_egp, locale) });

  const mobileSublabel =
    listing.price_egp !== null && listing.is_negotiable
      ? market('negotiable')
      : e(listing.offer_type);

  const statusHeadingKey =
    listing.status === 'sold'
      ? 'statusSoldTitle'
      : listing.status === 'traded'
        ? 'statusTradedTitle'
        : 'statusReservedTitle';

  const confirmedText = listing.last_confirmed_available_at
    ? t('confirmed', {
        date: new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          timeZone: 'Africa/Cairo',
        }).format(new Date(listing.last_confirmed_available_at)),
      })
    : t('confirmHint');

  return (
    <main
      id="main"
      className={`container detail-page${isActive ? ' has-mobile-bar' : ''}`}
    >
      <ViewTracker id={id} />

      <div className="detail-breadcrumb">
        <Link href="/" className="detail-back-link">
          <ArrowLeft size={16} className="icon-directional" aria-hidden />
          <span>{market('back')}</span>
        </Link>
      </div>

      <div className="detail-hero-grid">
        <ProductGallery
          listingId={id}
          title={listing.title}
          mediaIds={listing.media_ids}
        />

        <section className="detail-summary">
          <div className="detail-badges">
            {isActive ? (
              <span className={`condition is-${listing.condition}`}>
                {e(listing.condition)}
              </span>
            ) : (
              <>
                <span className={`condition detail-status-pill is-status-${listing.status}`}>
                  {e(listing.status)}
                </span>
                <span className={`detail-condition-pill is-${listing.condition}`}>
                  {e(listing.condition)}
                </span>
              </>
            )}
            <span className="card-meta-tag">{market(listing.category)}</span>
            <span className="card-meta-tag">{e(listing.offer_type)}</span>
          </div>

          <h1>
            <bdi>{listing.title}</bdi>
          </h1>

          <div className="detail-submeta">
            <span className="detail-brand-model">
              <strong className={isCuratedBrand ? 'is-curated-brand' : undefined}>
                <bdi>{brandLabel}</bdi>
              </strong>
              <span aria-hidden>·</span>
              <bdi>{listing.model}</bdi>
            </span>
            <span className="detail-location">
              <MapPin size={15} aria-hidden />
              <span>
                {governorateLabel}
                {listing.district_text && (
                  <>
                    {' · '}
                    <bdi>{listing.district_text}</bdi>
                  </>
                )}
              </span>
            </span>
          </div>

          {!isActive && (
            <div className={`detail-status-banner is-status-${listing.status}`}>
              <AlertCircle size={19} aria-hidden />
              <div>
                <p className="detail-status-title">{t(statusHeadingKey)}</p>
                <p className="detail-status-copy">{t('noContact')}</p>
              </div>
            </div>
          )}

          <div className="detail-price-card">
            <div className="detail-price-row">
              <p className="price detail-price">{priceDisplay}</p>
              {listing.is_negotiable && listing.price_egp !== null && (
                <span className="card-negotiable-tag">{market('negotiable')}</span>
              )}
            </div>

            {listing.price_egp === null && (
              <p className="detail-price-note">{t('swapOnlySublabel')}</p>
            )}
            {listing.category === 'balls' && (
              <p className="detail-price-note">{t('wholeOfferHint')}</p>
            )}

            {isActive ? (
              <div id="detail-primary-cta" className="detail-cta-wrap">
                <a
                  className="button primary detail-whatsapp-cta"
                  href={`/api/contact/${id}?locale=${locale}`}
                  rel="nofollow"
                >
                  <MessageCircle size={18} aria-hidden />
                  <span>{t('whatsapp')}</span>
                </a>
                <p className="detail-availability-note">
                  <CalendarCheck size={15} aria-hidden />
                  <span>{confirmedText}</span>
                </p>
              </div>
            ) : listing.last_confirmed_available_at ? (
              <p className="detail-availability-note">
                <CalendarCheck size={15} aria-hidden />
                <span>{confirmedText}</span>
              </p>
            ) : null}
          </div>

          <div className="detail-seller-card">
            <Link
              href={`/@${listing.seller.username}`}
              prefetch={false}
              className="detail-seller-link"
            >
              <span className="avatar" aria-hidden>
                {sellerInitial}
              </span>
              <div className="detail-seller-info">
                <span className="detail-seller-eyebrow">{t('seller')}</span>
                <strong className="detail-seller-name">
                  <bdi>{listing.seller.display_name}</bdi>
                </strong>
                <span className="detail-seller-meta">
                  <span className="detail-seller-handle">
                    <bdi>@{listing.seller.username}</bdi>
                  </span>
                  <span className="detail-seller-type">{t(listing.seller.account_type)}</span>
                </span>
              </div>
              <span className="detail-seller-cta">
                <span>{t('viewSellerProfile')}</span>
                <ChevronRight size={16} className="icon-directional" aria-hidden />
              </span>
            </Link>
          </div>
        </section>
      </div>

      <div className="detail-body-grid">
        <div className="detail-main-column">
          <section
            className={`detail-panel detail-disclosures-panel${
              listing.category === 'rackets' ? ' is-racket' : ''
            }`}
            aria-labelledby="disclosures-heading"
          >
            <div className="detail-panel-head">
              <span className="detail-panel-icon" aria-hidden>
                <ClipboardCheck size={18} />
              </span>
              <div>
                <h2 id="disclosures-heading">{t('disclosuresHeading')}</h2>
                {listing.category === 'rackets' && (
                  <p className="detail-panel-subtitle">{t('racketDisclosureNotice')}</p>
                )}
              </div>
            </div>

            <div className="detail-disclosure-stack">
              <div className="detail-disclosure-item">
                <h3>{e('condition_disclosure')}</h3>
                <p className="user-copy">
                  <bdi>{listing.condition_disclosure}</bdi>
                </p>
              </div>

              {listing.category === 'rackets' && listing.racket_damage_repair_disclosure && (
                <div className="detail-disclosure-item is-racket-damage">
                  <div className="detail-disclosure-label">
                    <AlertTriangle size={16} aria-hidden />
                    <h3>{t('racketDamageDisclosure')}</h3>
                  </div>
                  <p className="user-copy">
                    <bdi>{listing.racket_damage_repair_disclosure}</bdi>
                  </p>
                </div>
              )}
            </div>
          </section>

          {listing.category === 'rackets' && listing.swap_preference && (
            <section className="detail-panel detail-swap-panel" aria-labelledby="swap-heading">
              <div className="detail-panel-head">
                <span className="detail-panel-icon" aria-hidden>
                  <ArrowLeftRight size={18} />
                </span>
                <h2 id="swap-heading">{e('swap_preference')}</h2>
              </div>
              <p className="user-copy">
                <bdi>{listing.swap_preference}</bdi>
              </p>
            </section>
          )}

          <section className="detail-panel" aria-labelledby="specs-heading">
            <h2 id="specs-heading">{t('specsHeading')}</h2>
            <div className="spec-grid">
              <div className="spec-tile">
                <h3>{e('brand_slug')}</h3>
                <p className={isCuratedBrand ? 'is-curated-brand' : undefined}>
                  <bdi>{brandLabel}</bdi>
                </p>
              </div>

              <div className="spec-tile">
                <h3>{e('model')}</h3>
                <p>
                  <bdi>{listing.model}</bdi>
                </p>
              </div>

              <div className="spec-tile">
                <h3>{t('category')}</h3>
                <p>{market(listing.category)}</p>
              </div>

              <div className="spec-tile">
                <h3>{e('condition')}</h3>
                <p>{e(listing.condition)}</p>
              </div>

              <div className="spec-tile">
                <h3>{e('offer_type')}</h3>
                <p>{e(listing.offer_type)}</p>
              </div>

              <div className="spec-tile">
                <h3>{t('location')}</h3>
                <p>
                  {governorateLabel}
                  {listing.district_text && (
                    <>
                      {' · '}
                      <bdi>{listing.district_text}</bdi>
                    </>
                  )}
                </p>
              </div>

              {listing.category === 'shoes' && (
                <div className="spec-tile is-highlighted">
                  <h3>{e('shoe_size_eu')}</h3>
                  <p className="spec-tabular">{listing.shoe_size_eu}</p>
                </div>
              )}

              {listing.category === 'balls' && (
                <>
                  <div className="spec-tile is-highlighted">
                    <h3>{e('balls_quantity_packaging')}</h3>
                    <p>
                      <bdi>{listing.balls_quantity_packaging}</bdi>
                    </p>
                  </div>
                  {listing.balls_availability_note && (
                    <div className="spec-tile">
                      <h3>{e('balls_availability_note')}</h3>
                      <p>
                        <bdi>{listing.balls_availability_note}</bdi>
                      </p>
                    </div>
                  )}
                </>
              )}

              {racketSpecRows.map((spec) => (
                <div className="spec-tile is-highlighted" key={spec.key}>
                  <h3>{e(spec.key)}</h3>
                  <p className="spec-tabular">
                    <bdi>
                      {spec.kind === 'shape'
                        ? e(`shapes.${spec.value}`)
                        : spec.value.toLocaleString(locale, { useGrouping: false })}
                    </bdi>
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="detail-panel" aria-labelledby="description-heading">
            <h2 id="description-heading">{e('description')}</h2>
            <p className="user-copy detail-description">
              <bdi>{listing.description}</bdi>
            </p>
          </section>
        </div>

        <aside className="detail-side-column">
          <section className="detail-panel detail-safety-panel" aria-labelledby="safety-heading">
            <div className="detail-panel-head">
              <span className="detail-panel-icon" aria-hidden>
                <ShieldCheck size={18} />
              </span>
              <h2 id="safety-heading">{t('safetyHeading')}</h2>
            </div>
            <ul className="detail-safety-list">
              <li>
                <CheckCircle2 size={15} aria-hidden />
                <span>{t('safetyTip1')}</span>
              </li>
              <li>
                <CheckCircle2 size={15} aria-hidden />
                <span>{t('safetyTip2')}</span>
              </li>
              <li>
                <CheckCircle2 size={15} aria-hidden />
                <span>{t('safetyTip3')}</span>
              </li>
            </ul>
            <p className="detail-safety-disclaimer">{t('safety')}</p>
          </section>

          <div className="detail-report-box">
            <p className="detail-report-hint">{reports('sectionHint')}</p>
            <ReportForm type="listing" target={id} />
          </div>
        </aside>
      </div>

      {isActive && (
        <MobileContactBar
          listingId={id}
          locale={locale}
          priceLabel={priceDisplay}
          sublabel={mobileSublabel}
          targetId="detail-primary-cta"
        />
      )}
    </main>
  );
}
