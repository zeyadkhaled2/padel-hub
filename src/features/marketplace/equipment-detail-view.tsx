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
    <main id="main" className="container py-5 pb-14 md:py-7 md:pb-16">
      <Link
        href="/"
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[10px] bg-surface px-3.5 py-1.5 text-[13.5px] font-bold text-muted shadow-[var(--shadow-card)] transition-colors hover:text-accent"
      >
        <ArrowLeft
          size={15}
          className="shrink-0 rtl:rotate-180"
          aria-hidden="true"
        />
        <span>{t('back')}</span>
      </Link>

      <div className="mt-4 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.85fr)] lg:gap-7">
        {/* Primary photo showcase */}
        <figure className="m-0 overflow-hidden rounded-[20px] bg-surface shadow-[var(--shadow-card)] dark:ring-1 dark:ring-white/[0.08] lg:col-start-1 lg:row-start-1">
          <div className="relative aspect-[3/2] w-full bg-surface-soft">
            <EquipmentArt
              listing={listing}
              label={t('illustration')}
              hero
              sizes="(max-width: 1023px) 100vw, 58vw"
            />
          </div>
          <figcaption className="border-t border-line/70 bg-surface px-4 py-3 text-[12px] font-medium leading-snug text-muted">
            {t('illustration')}
          </figcaption>
        </figure>

        {/* Structured price, metadata, seller & contact card */}
        <section className="rounded-[20px] bg-surface p-5 md:p-6 shadow-[var(--shadow-dock)] dark:ring-1 dark:ring-white/[0.08] lg:sticky lg:top-22 lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              className={`inline-flex items-center rounded-[8px] px-2.5 py-1 text-[12px] font-bold leading-none ${
                isNew
                  ? 'bg-hero text-hero-ink'
                  : 'bg-[#0e1b38] text-white dark:bg-surface-soft dark:text-ink'
              }`}
            >
              {t(listing.condition)} · {t('sale')}
            </span>
            <span className="text-[12px] font-bold text-accent">
              {t('demo')}
            </span>
          </div>

          <p className="mt-4 font-display text-[30px] md:text-[36px] font-extrabold leading-none tracking-[-0.03em] text-ink tabular-nums">
            {t('price', { amount: formatAmount(listing.price, locale) })}
          </p>

          <h1 className="mt-2 font-display text-[22px] md:text-[26px] font-bold leading-[1.2] tracking-[-0.02em] text-ink">
            <bdi>{listing.name}</bdi>
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-y border-line/75 py-3.5">
            <span className="inline-flex items-center gap-1.5 rounded-[9px] bg-base px-2.5 py-1.5 text-[12.5px] font-semibold text-ink">
              <MapPin
                size={14}
                className="shrink-0 text-accent"
                aria-hidden="true"
              />
              <span>{t('location')}</span>
            </span>
            <span className="inline-flex items-center rounded-[9px] bg-surface-soft px-2.5 py-1.5 text-[12.5px] font-bold text-accent">
              <bdi>{listing.brand}</bdi>
            </span>
            <span className="inline-flex items-center rounded-[9px] bg-base px-2.5 py-1.5 text-[12.5px] font-semibold text-muted">
              {t(listing.category)}
            </span>
          </div>

          <div className="mt-4">
            <Link
              href="/sellers/omar_padel"
              className="group flex min-h-[60px] items-center gap-3.5 rounded-[14px] bg-base/80 p-3.5 transition-colors hover:bg-surface-soft/70"
            >
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-soft font-display text-[16px] font-extrabold text-accent"
                aria-hidden="true"
              >
                O
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-[15px] font-bold text-ink">
                  {t('seller')}
                </span>
                <small className="block text-[12.5px] font-medium text-muted">
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

          <p className="mt-3.5 flex items-start gap-2.5 rounded-[12px] bg-surface-soft/65 px-3.5 py-3 text-[13px] font-medium leading-snug text-muted">
            <MessageCircle
              size={16}
              className="mt-0.5 shrink-0 text-accent"
              aria-hidden="true"
            />
            <span>{t('contact')}</span>
          </p>
        </section>

        {/* Condition & disclosures panel */}
        <section className="rounded-[20px] bg-surface p-5 md:p-6 shadow-[var(--shadow-card)] dark:ring-1 dark:ring-white/[0.08] lg:col-start-1 lg:row-start-2">
          <div className="flex items-center gap-2.5">
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-surface-soft text-accent"
              aria-hidden="true"
            >
              <ShieldCheck size={17} />
            </span>
            <h2 className="font-display text-[18px] font-bold text-ink">
              {t('disclosure')}
            </h2>
          </div>

          <p className="mt-3 text-[15px] leading-[1.65] text-ink/90">
            {disclosureCopy}
          </p>

          <p className="mt-4 border-t border-line/75 pt-3.5 text-[13px] leading-relaxed text-muted">
            {t('tip')}
          </p>
        </section>
      </div>
    </main>
  );
}
