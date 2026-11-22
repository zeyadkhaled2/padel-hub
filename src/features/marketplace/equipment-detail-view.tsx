import { getTranslations, getLocale } from 'next-intl/server';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Info,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { formatAmount } from '@/lib/format';
import { EquipmentArt } from './equipment-art';
import type { DemoListing } from './demo-data';

interface EquipmentDetailViewProps {
  listing: DemoListing;
}

export async function EquipmentDetailView({
  listing,
}: EquipmentDetailViewProps) {
  const t = await getTranslations('market');
  const b = await getTranslations('buyer');
  const e = await getTranslations('listingEditor');
  const locale = await getLocale();

  const disclosureCopy =
    listing.condition === 'new' ? t('newDisclosure') : t('usedDisclosure');

  return (
    <main id="main" className="container detail-page">
      <div className="detail-breadcrumb">
        <Link href="/demo" className="detail-back-link">
          <ArrowLeft size={16} className="icon-directional" aria-hidden />
          <span>{t('back')}</span>
        </Link>
        <span className="demo-inline-note">{t('demo')}</span>
      </div>

      <div className="detail-hero-grid">
        <figure className="detail-demo-stage">
          <EquipmentArt listing={listing} label={t('illustration')} hero />
          <figcaption>{t('illustration')}</figcaption>
        </figure>

        <section className="detail-summary">
          <div className="detail-badges">
            <span className={`condition is-${listing.condition}`}>
              {t(listing.condition)}
            </span>
            <span className="card-meta-tag">{t(listing.category)}</span>
            <span className="card-meta-tag">{t('sale')}</span>
          </div>

          <h1>
            <bdi>{listing.name}</bdi>
          </h1>

          <div className="detail-submeta">
            <span className="detail-brand-model">
              <strong>
                <bdi>{listing.brand}</bdi>
              </strong>
            </span>
            <span className="detail-location">
              <MapPin size={15} aria-hidden />
              <span>{t('location')}</span>
            </span>
          </div>

          <div className="detail-price-card">
            <div className="detail-price-row">
              <p className="price detail-price">
                {t('price', { amount: formatAmount(listing.price, locale) })}
              </p>
            </div>
            <div className="detail-demo-notice">
              <Info size={16} aria-hidden />
              <p>{t('contact')}</p>
            </div>
          </div>

          <div className="detail-seller-card">
            <Link href="/demo/sellers/omar_padel" className="detail-seller-link">
              <span className="avatar" aria-hidden>
                O
              </span>
              <div className="detail-seller-info">
                <span className="detail-seller-eyebrow">{b('seller')}</span>
                <strong className="detail-seller-name">{t('seller')}</strong>
                <span className="detail-seller-meta">
                  <span className="detail-seller-handle">
                    <bdi>@omar_padel</bdi>
                  </span>
                  <span className="detail-seller-type">{t('individual')}</span>
                </span>
              </div>
              <span className="detail-seller-cta">
                <span>{t('profile')}</span>
                <ChevronRight size={16} className="icon-directional" aria-hidden />
              </span>
            </Link>
          </div>
        </section>
      </div>

      <div className="detail-body-grid">
        <div className="detail-main-column">
          <section className="detail-panel detail-disclosures-panel" aria-labelledby="demo-disclosure-heading">
            <div className="detail-panel-head">
              <span className="detail-panel-icon" aria-hidden>
                <ClipboardCheck size={18} />
              </span>
              <h2 id="demo-disclosure-heading">{t('disclosure')}</h2>
            </div>
            <p className="detail-description">{disclosureCopy}</p>
          </section>

          <section className="detail-panel" aria-labelledby="demo-specs-heading">
            <h2 id="demo-specs-heading">{b('specsHeading')}</h2>
            <div className="spec-grid">
              <div className="spec-tile">
                <h3>{e('brand_slug')}</h3>
                <p>
                  <bdi>{listing.brand}</bdi>
                </p>
              </div>
              <div className="spec-tile">
                <h3>{b('category')}</h3>
                <p>{t(listing.category)}</p>
              </div>
              <div className="spec-tile">
                <h3>{e('condition')}</h3>
                <p>{t(listing.condition)}</p>
              </div>
              <div className="spec-tile">
                <h3>{b('location')}</h3>
                <p>{t('location')}</p>
              </div>
            </div>
          </section>
        </div>

        <aside className="detail-side-column">
          <section className="detail-panel detail-safety-panel" aria-labelledby="demo-safety-heading">
            <div className="detail-panel-head">
              <span className="detail-panel-icon" aria-hidden>
                <ShieldCheck size={18} />
              </span>
              <h2 id="demo-safety-heading">{b('safetyHeading')}</h2>
            </div>
            <ul className="detail-safety-list">
              <li>
                <CheckCircle2 size={15} aria-hidden />
                <span>{b('safetyTip1')}</span>
              </li>
              <li>
                <CheckCircle2 size={15} aria-hidden />
                <span>{b('safetyTip2')}</span>
              </li>
              <li>
                <CheckCircle2 size={15} aria-hidden />
                <span>{b('safetyTip3')}</span>
              </li>
            </ul>
            <p className="detail-safety-disclaimer">{b('safety')}</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
