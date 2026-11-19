import { getTranslations } from 'next-intl/server';
import { CheckCircle2, MapPin } from 'lucide-react';
import { HeroStage } from './hero-stage';

export async function HeroSection() {
  const t = await getTranslations('market');

  return (
    <section className="hero-courtside relative mt-3 md:mt-4 grid grid-cols-1 md:grid-cols-[minmax(0,1.32fr)_minmax(0,0.68fr)] items-center overflow-hidden rounded-[20px] border border-line pb-7 md:pb-8 text-ink">
      {/* Subtle theme-adaptive architectural court-line geometry */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1200 420"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full text-accent/[0.08] dark:text-accent/[0.12] rtl:-scale-x-100"
      >
        <line
          x1="0"
          y1="332"
          x2="1200"
          y2="238"
          stroke="currentColor"
          strokeWidth="1.25"
        />
        <line
          x1="640"
          y1="0"
          x2="788"
          y2="420"
          stroke="currentColor"
          strokeWidth="1.25"
        />
        <line
          x1="980"
          y1="0"
          x2="1086"
          y2="420"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeDasharray="6 6"
        />
      </svg>

      <div className="relative z-10 min-w-0 px-4 pt-4 pb-1 sm:px-6 md:ps-8 md:pe-3 md:pt-6 md:pb-2 lg:ps-9">
        <h1 className="max-w-[540px] font-display text-[clamp(1.65rem,6.4vw,2.15rem)] md:text-[clamp(2rem,2.85vw,2.65rem)] font-extrabold leading-[1.06] tracking-[-0.03em] text-ink rtl:leading-[1.3] rtl:tracking-normal">
          {t('title')}
        </h1>

        <p className="mt-2 max-w-[470px] text-[14px] md:text-[15px] leading-[1.58] text-muted">
          {t('intro')}
        </p>

        <ul
          className="mt-3.5 hidden md:flex list-none flex-wrap items-center gap-x-3 gap-y-2 p-0"
          aria-label={t('badge')}
        >
          <li className="inline-flex items-center gap-1.5 rounded-[8px] bg-gold-soft px-2.5 py-1 text-[11.5px] font-bold text-ink">
            <MapPin size={12} className="text-accent" aria-hidden="true" />
            <span>{t('badge')}</span>
          </li>
          <li className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-muted">
            <CheckCircle2
              size={12.5}
              className="shrink-0 text-accent"
              aria-hidden="true"
            />
            <span>{t('heroHighlight1')}</span>
          </li>
          <li className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-muted">
            <CheckCircle2
              size={12.5}
              className="shrink-0 text-accent"
              aria-hidden="true"
            />
            <span>{t('heroHighlight2')}</span>
          </li>
          <li className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-muted">
            <CheckCircle2
              size={12.5}
              className="shrink-0 text-accent"
              aria-hidden="true"
            />
            <span>{t('heroHighlight3')}</span>
          </li>
        </ul>
      </div>

      <HeroStage alt={t('illustration')} caption={t('courtCaption')} />
    </section>
  );
}
