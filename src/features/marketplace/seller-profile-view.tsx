import { getTranslations } from 'next-intl/server';
import { ArrowLeft, MapPin } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { demoListings } from './demo-data';
import { ListingCard } from './listing-card';

export async function SellerProfileView() {
  const t = await getTranslations('market');

  return (
    <main id="main" className="container py-5 pb-14 md:py-7 md:pb-16">
      <Button
        asChild
        variant="outline"
        size="sm"
        className="min-h-[40px] gap-1.5 text-[13.5px] text-muted-foreground hover:text-brand"
      >
        <Link href="/">
          <ArrowLeft
            size={15}
            className="shrink-0 rtl:rotate-180"
            aria-hidden="true"
          />
          <span>{t('back')}</span>
        </Link>
      </Button>

      <section className="storefront-banner relative mt-4 flex flex-col items-start gap-5 overflow-hidden rounded-[20px] border border-border/80 p-6 sm:p-8 text-foreground sm:flex-row sm:items-center">
        <Avatar
          className="h-18 w-18 sm:h-22 sm:w-22 ring-1 ring-brand/20"
          aria-hidden="true"
        >
          <AvatarFallback className="text-[28px] sm:text-[34px]">
            O
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h1 className="font-display text-[26px] sm:text-[34px] font-extrabold leading-tight text-foreground">
            {t('seller')}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="font-bold text-brand">
              <bdi>@omar_padel</bdi>
            </span>
            <Badge variant="outline" className="py-0.5 text-[12px]">
              {t('individual')}
            </Badge>
            <span className="text-[12px] font-semibold text-muted-foreground">
              {t('demo')}
            </span>
          </div>
          <p className="mt-3 max-w-[540px] text-[14.5px] sm:text-[15px] leading-relaxed text-muted-foreground">
            {t('bio')}
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground/85">
            <MapPin size={14} className="text-brand" aria-hidden="true" />
            <span>{t('location')}</span>
          </p>
        </div>
      </section>

      <section className="mt-8 md:mt-10">
        <h2 className="mb-4 font-display text-[21px] md:text-[25px] font-extrabold text-foreground">
          {t('heading')}
        </h2>
        <div className="grid grid-cols-1 min-[360px]:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 md:gap-5">
          {demoListings.map((listing) => (
            <ListingCard listing={listing} key={listing.id} />
          ))}
        </div>
      </section>
    </main>
  );
}
