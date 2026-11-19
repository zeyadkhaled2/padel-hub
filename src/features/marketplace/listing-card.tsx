import { getTranslations, getLocale } from 'next-intl/server';
import { ChevronRight, MapPin } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { formatAmount } from '@/lib/format';
import { EquipmentArt } from './equipment-art';
import type { DemoListing } from './demo-data';

interface ListingCardProps {
  listing: DemoListing;
}

export async function ListingCard({ listing }: ListingCardProps) {
  const t = await getTranslations('market');
  const locale = await getLocale();
  const isNew = listing.condition === 'new';

  return (
    <article className="listing-card group relative flex min-w-0 flex-col overflow-hidden rounded-[15px] border border-line bg-surface transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[var(--shadow-card-hover)]">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-subtle ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.05]">
        <EquipmentArt
          listing={listing}
          label={t('illustration')}
          imageClassName="transition-transform duration-300 ease-out group-hover:scale-[1.03]"
        />
        <span
          className={`pointer-events-none absolute top-2.5 start-2.5 z-10 rounded-[7px] px-2.5 py-1 text-[11px] font-bold leading-none ${
            isNew
              ? 'bg-hero text-hero-ink'
              : 'border border-line/70 bg-surface/92 text-ink backdrop-blur-md'
          }`}
        >
          {t(listing.condition)}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-display text-[17.5px] sm:text-[21px] font-extrabold leading-none tracking-[-0.025em] text-ink tabular-nums">
            {t('price', { amount: formatAmount(listing.price, locale) })}
          </p>
          <span className="hidden shrink-0 rounded-[6px] bg-surface-subtle px-2 py-0.5 text-[11px] font-semibold text-muted sm:inline-block">
            {t('sale')}
          </span>
        </div>

        <h3 className="mt-2 font-sans text-[14px] sm:text-[15.5px] font-bold leading-[1.35] tracking-normal text-ink line-clamp-2">
          <Link
            href={`/equipment/${listing.id}`}
            className="transition-colors group-hover:text-accent after:absolute after:inset-0 after:content-['']"
          >
            <bdi>{listing.name}</bdi>
          </Link>
        </h3>

        <p className="mt-1.5 mb-3 flex items-center gap-x-1.5 text-[12px] font-medium text-muted">
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin
              size={13}
              className="shrink-0 text-muted"
              aria-hidden="true"
            />
            <span className="truncate">{t('location')}</span>
          </span>
          <span aria-hidden="true" className="hidden text-line-strong sm:inline">
            ·
          </span>
          <span className="hidden shrink-0 font-semibold text-ink/80 sm:inline">
            <bdi>{listing.brand}</bdi>
          </span>
        </p>

        <div className="mt-auto border-t border-line/80 pt-2.5">
          <Link
            href="/sellers/omar_padel"
            className="relative z-10 -mx-1 -my-1.5 flex min-h-[44px] w-[calc(100%+0.5rem)] items-center justify-between gap-2 rounded-[10px] px-1 text-[12.5px] font-semibold text-muted transition-colors hover:text-ink"
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <span
                className="grid h-6.5 w-6.5 shrink-0 place-items-center rounded-full bg-surface-soft font-display text-[11.5px] font-extrabold text-accent"
                aria-hidden="true"
              >
                O
              </span>
              <span className="truncate">{t('seller')}</span>
            </span>
            <ChevronRight
              size={14}
              className="shrink-0 text-muted/75 transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        </div>
      </div>
    </article>
  );
}
