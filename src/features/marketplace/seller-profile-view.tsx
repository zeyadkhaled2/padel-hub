import { getTranslations } from 'next-intl/server';
import { ArrowLeft, MapPin } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { demoListings } from './demo-data';
import { ListingCard } from './listing-card';

export async function SellerProfileView() {
  const t = await getTranslations('market');

  return (
    <main id="main" className="container py-5 pb-14 md:py-7 md:pb-16">
      <Link
        href="/"
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[10px] border border-line bg-surface px-3.5 py-1.5 text-[13.5px] font-semibold text-muted transition-colors hover:border-line-strong hover:text-accent"
      >
        <ArrowLeft
          size={15}
          className="shrink-0 rtl:rotate-180"
          aria-hidden="true"
        />
        <span>{t('back')}</span>
      </Link>

      <section className="hero-courtside relative mt-4 flex flex-col items-start gap-5 overflow-hidden rounded-[20px] border border-line p-6 sm:p-8 text-ink sm:flex-row sm:items-center">
        <span
          className="grid h-18 w-18 sm:h-22 sm:w-22 shrink-0 place-items-center rounded-full bg-surface-soft font-display text-[28px] sm:text-[34px] font-extrabold text-accent ring-1 ring-accent/20"
          aria-hidden="true"
        >
          O
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-[26px] sm:text-[34px] font-extrabold leading-tight text-ink">
            {t('seller')}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="font-bold text-accent">
              <bdi>@omar_padel</bdi>
            </span>
            <span className="rounded-[7px] border border-line bg-surface px-2.5 py-0.5 text-[12px] font-semibold text-ink">
              {t('individual')}
            </span>
            <span className="text-[12px] font-semibold text-muted">
              {t('demo')}
            </span>
          </div>
          <p className="mt-3 max-w-[540px] text-[14.5px] sm:text-[15px] leading-relaxed text-muted">
            {t('bio')}
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink/85">
            <MapPin size={14} className="text-accent" aria-hidden="true" />
            <span>{t('location')}</span>
          </p>
        </div>
      </section>

      <section className="mt-8 md:mt-10">
        <h2 className="mb-4 font-display text-[21px] md:text-[25px] font-extrabold text-ink">
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
