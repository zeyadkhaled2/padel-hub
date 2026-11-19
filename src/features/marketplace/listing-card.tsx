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
    <article className="listing-card group relative flex min-w-0 flex-col overflow-hidden rounded-[8px] border border-border bg-card text-card-foreground transition-[border-color,box-shadow] duration-150 hover:border-foreground/35 hover:shadow-[var(--shadow-card-hover)]">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        <EquipmentArt
          listing={listing}
          label={t('illustration')}
          imageClassName="transition-transform duration-200 ease-out group-hover:scale-[1.03]"
        />
        <Badge
          variant={isNew ? 'gold' : 'frosted'}
          className="pointer-events-none absolute top-2.5 start-2.5 z-10 rounded-[4px] px-2 py-1 text-[10.5px] uppercase tracking-[0.03em] rtl:normal-case rtl:tracking-normal"
        >
          {t(listing.condition)}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col p-3.5 sm:p-4">
        <p className="flex items-center gap-x-1.5 text-[11.5px] font-medium text-muted-foreground">
          <span className="shrink-0 font-bold text-foreground/80">
            <bdi>{listing.brand}</bdi>
          </span>
          <span aria-hidden="true" className="text-border-strong">
            ·
          </span>
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin
              size={11.5}
              className="shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="truncate">{t('location')}</span>
          </span>
        </p>

        <h3 className="mt-1 font-sans text-[14.5px] sm:text-[15.5px] font-semibold leading-[1.32] tracking-[-0.01em] text-foreground line-clamp-2">
          <Link
            href={`/equipment/${listing.id}`}
            className="transition-colors group-hover:text-brand after:absolute after:inset-0 after:content-['']"
          >
            <bdi>{listing.name}</bdi>
          </Link>
        </h3>

        <div className="mt-2.5 mb-3 flex items-baseline justify-between gap-2">
          <p className="font-display text-[19px] sm:text-[22px] font-extrabold leading-none tracking-[-0.03em] text-foreground tabular-nums">
            {t('price', { amount: formatAmount(listing.price, locale) })}
          </p>
          <span className="hidden shrink-0 rounded-[4px] bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground sm:inline">
            {t('sale')}
          </span>
        </div>

        <div className="mt-auto">
          <Separator className="mb-2 bg-border/80" />
          <Link
            href="/sellers/omar_padel"
            className="relative z-10 -mx-1 -my-1.5 flex min-h-[40px] w-[calc(100%+0.5rem)] items-center justify-between gap-2 rounded-[6px] px-1 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <Avatar className="h-6 w-6" aria-hidden="true">
                <AvatarFallback className="text-[10.5px]">O</AvatarFallback>
              </Avatar>
              <span className="truncate">{t('seller')}</span>
            </span>
            <ChevronRight
              size={14}
              className="shrink-0 text-muted-foreground/70 transition-transform duration-150 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        </div>
      </div>
    </article>
  );
}
