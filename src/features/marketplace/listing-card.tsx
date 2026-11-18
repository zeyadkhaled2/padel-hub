import { getTranslations, getLocale } from 'next-intl/server';
import { MapPin } from 'lucide-react';
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
    <article className="listing-card group relative flex min-w-0 flex-col overflow-hidden rounded-[14px] border border-line bg-surface transition-colors duration-200 hover:border-accent">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-soft">
        <EquipmentArt
          listing={listing}
          label={t('illustration')}
          imageClassName="transition-transform duration-300 ease-out group-hover:scale-[1.03]"
        />
        <span
          className={`pointer-events-none absolute top-2 start-2 z-10 rounded-[7px] px-2 py-0.5 text-[11px] font-bold leading-tight ${
            isNew
              ? 'bg-hero text-hero-ink'
              : 'border border-line/70 bg-surface/95 text-ink'
          }`}
        >
          {t(listing.condition)}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-2.5 sm:p-3.5">
        <div className="flex items-baseline justify-between gap-1.5">
          <p className="text-[16px] sm:text-[18px] font-extrabold leading-tight tracking-[-0.02em] text-ink tabular-nums">
            {t('price', { amount: formatAmount(listing.price, locale) })}
          </p>
          <span className="hidden shrink-0 text-[11px] font-medium text-muted sm:inline">
            {t('sale')}
          </span>
        </div>

        <h3 className="mt-1 text-[13.5px] sm:text-[14.5px] font-semibold leading-[1.35] text-ink line-clamp-2">
          <Link
            href={`/equipment/${listing.id}`}
            className="transition-colors hover:text-accent after:absolute after:inset-0 after:content-['']"
          >
            <bdi>{listing.name}</bdi>
          </Link>
        </h3>

        <p className="mt-1.5 mb-2.5 inline-flex items-center gap-1 text-[11.5px] sm:text-[12px] text-muted">
          <MapPin size={13} className="shrink-0" aria-hidden="true" />
          <span className="truncate">{t('location')}</span>
        </p>

        <div className="mt-auto border-t border-line/80 pt-2">
          <Link
            href="/sellers/omar_padel"
            className="relative z-10 -mx-1 -my-1.5 inline-flex min-h-[44px] w-[calc(100%+0.5rem)] items-center gap-2 rounded-[8px] px-1 text-[12px] sm:text-[12.5px] font-medium text-muted transition-colors hover:text-ink"
          >
            <span
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-soft text-[11px] font-bold text-accent"
              aria-hidden="true"
            >
              O
            </span>
            <span className="truncate">{t('seller')}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
