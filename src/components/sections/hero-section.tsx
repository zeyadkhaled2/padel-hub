import { getTranslations } from 'next-intl/server';
import { CheckCircle2, MapPin } from 'lucide-react';
import { HeroStage } from './hero-stage';

export async function HeroSection() {
  const t = await getTranslations('market');

  return (
    <section className="hero-courtside relative mt-2.5 md:mt-3.5 grid grid-cols-1 md:grid-cols-[minmax(0,1.22fr)_minmax(0,0.78fr)] items-center overflow-hidden rounded-[20px] md:rounded-[24px] pb-7 md:pb-8 text-white shadow-[var(--shadow-dock)] dark:ring-1 dark:ring-white/[0.08]">
      {/* Continuous architectural court-line geometry across the full banner */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1200 420"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.11] rtl:-scale-x-100"
      >
        <line
          x1="0"
          y1="336"
          x2="1200"
          y2="242"
          stroke="#ffffff"
          strokeWidth="1.25"
        />
        <line
          x1="640"
          y1="0"
          x2="788"
          y2="420"
          stroke="#ffffff"
          strokeWidth="1.25"
        />
        <line
          x1="980"
          y1="0"
          x2="1086"
          y2="420"
          stroke="#f6d957"
          strokeWidth="1.25"
          strokeDasharray="6 6"
        />
      </svg>

      <div className="relative z-10 min-w-0 px-4 pt-4 pb-1 sm:px-6 md:ps-8 md:pe-4 md:pt-5 md:pb-2 lg:ps-9">
        <h1 className="max-w-[540px] font-display text-[clamp(1.6rem,6.4vw,2.1rem)] md:text-[clamp(1.95rem,2.75vw,2.6rem)] font-extrabold leading-[1.06] tracking-[-0.03em] text-white rtl:leading-[1.3] rtl:tracking-normal">
          {t('title')}
        </h1>

        <p className="mt-1.5 md:mt-2 max-w-[470px] text-[13.5px] md:text-[14.5px] leading-[1.52] text-[#cbd7f0]">
          {t('intro')}
        </p>

        <ul
          className="mt-3 hidden md:flex list-none flex-wrap items-center gap-1.5 p-0"
          aria-label={t('badge')}
        >
          <li className="inline-flex items-center gap-1.5 rounded-[7px] bg-hero px-2.5 py-1 text-[11px] font-bold text-hero-ink">
            <MapPin size={12} aria-hidden="true" />
            <span>{t('badge')}</span>
          </li>
          <li className="inline-flex items-center gap-1.5 rounded-[7px] bg-white/[0.08] px-2.5 py-1 text-[11px] font-semibold text-[#e6eefc]">
            <CheckCircle2 size={12} className="text-hero" aria-hidden="true" />
            <span>{t('heroHighlight1')}</span>
          </li>
          <li className="inline-flex items-center gap-1.5 rounded-[7px] bg-white/[0.08] px-2.5 py-1 text-[11px] font-semibold text-[#e6eefc]">
            <CheckCircle2 size={12} className="text-hero" aria-hidden="true" />
            <span>{t('heroHighlight2')}</span>
          </li>
          <li className="inline-flex items-center gap-1.5 rounded-[7px] bg-white/[0.08] px-2.5 py-1 text-[11px] font-semibold text-[#e6eefc]">
            <CheckCircle2 size={12} className="text-hero" aria-hidden="true" />
            <span>{t('heroHighlight3')}</span>
          </li>
        </ul>
      </div>

      <HeroStage alt={t('illustration')} caption={t('courtCaption')} />
    </section>
  );
}
