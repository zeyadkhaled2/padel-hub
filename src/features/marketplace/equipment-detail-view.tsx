import { getTranslations, getLocale } from 'next-intl/server';
import {
  ArrowLeft,
  ChevronRight,
  MapPin,
  MessageCircle,
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
  const locale = await getLocale();
  const isNew = listing.condition === 'new';

  const disclosureCopy = isNew ? t('newDisclosure') : t('usedDisclosure');

  return (
    <main id="main" className="container py-6 pb-14 md:py-8 md:pb-16">
      <Link
        href="/"
        className="inline-flex min-h-[44px] items-center gap-1.5 text-[14px] font-semibold text-muted transition-colors hover:text-accent"
      >
        <ArrowLeft
          size={16}
          className="shrink-0 rtl:rotate-180"
          aria-hidden="true"
        />
        <span>{t('back')}</span>
      </Link>

      <div className="mt-3 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.85fr)] lg:gap-7">
        {/* Primary photo showcase */}
        <figure className="m-0 overflow-hidden rounded-[18px] border border-line bg-surface lg:col-start-1 lg:row-start-1">
          <div className="relative aspect-[3/2] w-full bg-surface-soft">
            <EquipmentArt
              listing={listing}
              label={t('illustration')}
              hero
              sizes="(max-width: 1023px) 100vw, 58vw"
            />
          </div>
          <figcaption className="border-t border-line/80 bg-surface-soft/45 px-4 py-2.5 text-[12px] leading-snug text-muted">
            {t('illustration')}
          </figcaption>
        </figure>

        {/* Structured price, metadata, seller & contact card */}
        <section className="rounded-[18px] border border-line bg-surface p-5 md:p-6 lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-[7px] px-2.5 py-1 text-[12px] font-bold leading-none ${
                isNew
                  ? 'bg-hero text-hero-ink'
                  : 'bg-surface-soft text-ink'
              }`}
            >
              {t(listing.condition)} · {t('sale')}
            </span>
            <span className="demo-inline-note">{t('demo')}</span>
          </div>

          <p className="mt-3.5 text-[28px] md:text-[32px] font-extrabold leading-tight tracking-[-0.03em] text-ink tabular-nums">
            {t('price', { amount: formatAmount(listing.price, locale) })}
          </p>

          <h1 className="mt-1.5 text-[22px] md:text-[26px] font-bold leading-[1.25] tracking-[-0.02em] text-ink">
            <bdi>{listing.name}</bdi>
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-b border-line/80 pb-4">
            <span className="inline-flex items-center gap-1.5 rounded-[8px] bg-base px-2.5 py-1 text-[12.5px] font-medium text-muted">
              <MapPin
                size={14}
                className="shrink-0 text-accent"
                aria-hidden="true"
              />
              <span>{t('location')}</span>
            </span>
            <span className="inline-flex items-center rounded-[8px] bg-base px-2.5 py-1 text-[12.5px] font-semibold text-ink">
              <bdi>{listing.brand}</bdi>
            </span>
            <span className="inline-flex items-center rounded-[8px] bg-base px-2.5 py-1 text-[12.5px] font-medium text-muted">
              {t(listing.category)}
            </span>
          </div>

          <div className="mt-4">
            <Link
              href="/sellers/omar_padel"
              className="group flex min-h-[56px] items-center gap-3 rounded-[14px] border border-line bg-base/60 p-3 transition-colors hover:border-accent hover:bg-surface-soft/50"
            >
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-soft text-[16px] font-bold text-accent"
                aria-hidden="true"
              >
                O
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-bold text-ink">
                  {t('seller')}
                </span>
                <small className="block text-[12.5px] text-muted">
                  {t('profile')}
                </small>
              </span>
              <ChevronRight
                size={18}
                className="shrink-0 text-muted transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </div>

          <p className="mt-3.5 flex items-start gap-2.5 rounded-[12px] border border-line bg-surface-soft/60 px-3.5 py-3 text-[13px] leading-snug text-muted">
            <MessageCircle
              size={16}
              className="mt-0.5 shrink-0 text-accent"
              aria-hidden="true"
            />
            <span>{t('contact')}</span>
          </p>
        </section>

        {/* Condition & disclosures panel */}
        <section className="rounded-[18px] border border-line bg-surface p-5 md:p-6 lg:col-start-1 lg:row-start-2">
          <div className="flex items-center gap-2">
            <ShieldCheck
              size={18}
              className="shrink-0 text-accent"
              aria-hidden="true"
            />
            <h2 className="text-[17px] font-bold text-ink">
              {t('disclosure')}
            </h2>
          </div>

          <p className="mt-2.5 text-[15px] leading-[1.65] text-ink/90">
            {disclosureCopy}
          </p>

          <p className="mt-4 border-t border-line/80 pt-3.5 text-[13px] leading-relaxed text-muted">
            {t('tip')}
          </p>
        </section>
      </div>
    </main>
  );
}
