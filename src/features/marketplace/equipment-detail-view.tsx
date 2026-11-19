import { getTranslations, getLocale } from 'next-intl/server';
import {
  ArrowLeft,
  ChevronRight,
  Layers,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Tag,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { formatAmount } from '@/lib/format';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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

      <div className="mt-4 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.85fr)] lg:gap-7">
        {/* Primary photo showcase */}
        <Card className="overflow-hidden rounded-[18px] lg:col-start-1 lg:row-start-1">
          <figure className="m-0">
            <div className="relative aspect-[3/2] w-full bg-muted">
              <EquipmentArt
                listing={listing}
                label={t('illustration')}
                hero
                sizes="(max-width: 1023px) 100vw, 58vw"
              />
            </div>
            <figcaption className="border-t border-border/80 bg-muted/50 px-4 py-3 text-[12px] font-medium leading-snug text-muted-foreground">
              {t('illustration')}
            </figcaption>
          </figure>
        </Card>

        {/* Structured price, specifications, seller & contact card */}
        <section className="lg:sticky lg:top-22 lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <Card className="rounded-[18px] p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge
                variant={isNew ? 'gold' : 'outline'}
                className={
                  isNew ? 'text-[12px]' : 'bg-muted text-[12px] font-bold'
                }
              >
                {t(listing.condition)} · {t('sale')}
              </Badge>
              <span className="text-[12px] font-semibold text-brand">
                {t('demo')}
              </span>
            </div>

            <p className="mt-4 font-display text-[30px] md:text-[36px] font-extrabold leading-none tracking-[-0.03em] text-foreground tabular-nums">
              {t('price', { amount: formatAmount(listing.price, locale) })}
            </p>

            <h1 className="mt-2 font-display text-[22px] md:text-[26px] font-bold leading-[1.2] tracking-[-0.02em] text-foreground">
              <bdi>{listing.name}</bdi>
            </h1>

            <Separator className="mt-5 bg-border/80" />

            {/* Structured key specifications grid */}
            <dl className="grid grid-cols-2 gap-2.5 py-4">
              <div className="rounded-[11px] bg-muted/75 px-3 py-2.5">
                <dt className="flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
                  <Tag
                    size={12}
                    className="shrink-0 text-brand"
                    aria-hidden="true"
                  />
                  <span>{t('category')}</span>
                </dt>
                <dd className="mt-1 text-[13.5px] font-bold text-foreground">
                  <bdi>{listing.brand}</bdi> · {t(listing.category)}
                </dd>
              </div>

              <div className="rounded-[11px] bg-muted/75 px-3 py-2.5">
                <dt className="flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
                  <MapPin
                    size={12}
                    className="shrink-0 text-brand"
                    aria-hidden="true"
                  />
                  <span>{t('individual')}</span>
                </dt>
                <dd className="mt-1 truncate text-[13.5px] font-bold text-foreground">
                  {t('location')}
                </dd>
              </div>
            </dl>

            <Separator className="bg-border/80" />

            <div className="mt-4">
              <Link
                href="/sellers/omar_padel"
                className="group flex min-h-[60px] items-center gap-3.5 rounded-[13px] border border-border bg-muted/55 p-3.5 transition-colors hover:border-border-strong hover:bg-muted"
              >
                <Avatar className="h-11 w-11" aria-hidden="true">
                  <AvatarFallback className="text-[16px]">O</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[15px] font-bold text-foreground">
                    {t('seller')}
                  </span>
                  <small className="block text-[12.5px] font-medium text-muted-foreground">
                    {t('profile')}
                  </small>
                </span>
                <ChevronRight
                  size={18}
                  className="shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </div>

            <p className="mt-3.5 flex items-start gap-2.5 rounded-[12px] border border-border/80 bg-accent/55 px-3.5 py-3 text-[13px] font-medium leading-snug text-muted-foreground">
              <MessageCircle
                size={16}
                className="mt-0.5 shrink-0 text-brand"
                aria-hidden="true"
              />
              <span>{t('contact')}</span>
            </p>
          </Card>
        </section>

        {/* Condition & disclosures panel */}
        <section className="lg:col-start-1 lg:row-start-2">
          <Card className="rounded-[18px] p-5 md:p-6">
            <div className="flex items-center gap-2.5">
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-accent text-accent-foreground"
                aria-hidden="true"
              >
                {isNew ? <Layers size={16} /> : <ShieldCheck size={17} />}
              </span>
              <h2 className="font-display text-[18px] font-bold text-foreground">
                {t('disclosure')}
              </h2>
            </div>

            <p className="mt-3 text-[15px] leading-[1.65] text-foreground/90">
              {disclosureCopy}
            </p>

            <Separator className="mt-4 bg-border/80" />

            <p className="pt-3.5 text-[13px] leading-relaxed text-muted-foreground">
              {t('tip')}
            </p>
          </Card>
        </section>
      </div>
    </main>
  );
}
