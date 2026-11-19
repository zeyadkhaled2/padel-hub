import { getTranslations, getLocale } from 'next-intl/server';
import { ChevronRight, MapPin } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { formatAmount } from '@/lib/format';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
    <article className="listing-card group relative flex min-w-0 flex-col overflow-hidden rounded-[16px] border border-border/80 bg-card text-card-foreground transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[var(--shadow-card-hover)]">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        <EquipmentArt
          listing={listing}
          label={t('illustration')}
          imageClassName="transition-transform duration-300 ease-out group-hover:scale-[1.03]"
        />
        <Badge
          variant={isNew ? 'gold' : 'frosted'}
          className="pointer-events-none absolute top-3 start-3 z-10 rounded-full px-2.5 py-1 text-[11px]"
        >
          {t(listing.condition)}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col p-3.5 sm:p-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-display text-[18px] sm:text-[21px] font-extrabold leading-none tracking-[-0.03em] text-foreground tabular-nums">
            {t('price', { amount: formatAmount(listing.price, locale) })}
          </p>
          <span className="hidden shrink-0 text-[11.5px] font-medium text-muted-foreground sm:inline">
            {t('sale')}
          </span>
        </div>

        <h3 className="mt-2 font-sans text-[14px] sm:text-[15.5px] font-semibold leading-[1.35] tracking-[-0.01em] text-foreground line-clamp-2">
          <Link
            href={`/equipment/${listing.id}`}
            className="transition-colors group-hover:text-brand after:absolute after:inset-0 after:content-['']"
          >
            <bdi>{listing.name}</bdi>
          </Link>
        </h3>

        <p className="mt-1.5 mb-3 flex items-center gap-x-1.5 text-[12px] font-medium text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin
              size={12.5}
              className="shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="truncate">{t('location')}</span>
          </span>
          <span
            aria-hidden="true"
            className="hidden text-border-strong sm:inline"
          >
            ·
          </span>
          <span className="hidden shrink-0 font-medium text-foreground/80 sm:inline">
            <bdi>{listing.brand}</bdi>
          </span>
        </p>

        <div className="mt-auto">
          <Separator className="mb-2.5 bg-border/65" />
          <Link
            href="/sellers/omar_padel"
            className="relative z-10 -mx-1 -my-1.5 flex min-h-[44px] w-[calc(100%+0.5rem)] items-center justify-between gap-2 rounded-[10px] px-1 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <Avatar className="h-6.5 w-6.5" aria-hidden="true">
                <AvatarFallback className="text-[11px]">O</AvatarFallback>
              </Avatar>
              <span className="truncate">{t('seller')}</span>
            </span>
            <ChevronRight
              size={14}
              className="shrink-0 text-muted-foreground/70 transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        </div>
      </div>
    </article>
  );
}
