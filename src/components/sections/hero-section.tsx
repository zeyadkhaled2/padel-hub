import { getTranslations } from 'next-intl/server';
import { CheckCircle2, MapPin } from 'lucide-react';
import { HeroStage } from './hero-stage';

export async function HeroSection() {
  const t = await getTranslations('market');

  return (
    <section className="hero-billboard relative mt-3.5 md:mt-4 overflow-hidden rounded-[12px] border border-white/10 dark:border-border px-5 py-3.5 sm:px-7 md:px-8 md:py-4 text-white">
      {/* Subtle architectural court geometry inside the dark showcase panel */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1200 280"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full text-white/[0.06] rtl:-scale-x-100"
      >
        <line
          x1="0"
          y1="210"
          x2="1200"
          y2="148"
          stroke="currentColor"
          strokeWidth="1"
        />
        <line
          x1="680"
          y1="0"
          x2="790"
          y2="280"
          stroke="currentColor"
          strokeWidth="1"
        />
        <line
          x1="960"
          y1="0"
          x2="1040"
          y2="280"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="5 7"
        />
      </svg>

      <div className="relative z-10 grid grid-cols-1 md:grid-cols-[minmax(0,1.32fr)_minmax(0,0.68fr)] items-center gap-2 md:gap-6">
        <div className="min-w-0 py-1 md:py-2">
          <h1 className="max-w-[520px] font-display text-[clamp(1.6rem,6vw,2.1rem)] md:text-[clamp(2rem,2.8vw,2.65rem)] font-extrabold leading-[1.06] tracking-[-0.03em] text-white rtl:leading-[1.28] rtl:tracking-normal">
            {t('title')}
          </h1>

          <p className="mt-2 max-w-[460px] text-[13.5px] md:text-[15px] leading-[1.58] text-zinc-300">
            {t('intro')}
          </p>

          <ul
            className="mt-3.5 hidden md:flex list-none flex-wrap items-center gap-x-4 gap-y-2 p-0"
            aria-label={t('badge')}
          >
            <li className="inline-flex items-center gap-1.5 rounded-[5px] border border-emerald-400/25 bg-emerald-500/15 px-2.5 py-1 text-[11.5px] font-semibold text-emerald-200">
              <MapPin
                size={12}
                className="shrink-0 text-[#d4f838]"
                aria-hidden="true"
              />
              <span>{t('badge')}</span>
            </li>
            <li className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-300">
              <CheckCircle2
                size={13}
                className="shrink-0 text-[#17c981]"
                aria-hidden="true"
              />
              <span>{t('heroHighlight1')}</span>
            </li>
            <li className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-300">
              <CheckCircle2
                size={13}
                className="shrink-0 text-[#17c981]"
                aria-hidden="true"
              />
              <span>{t('heroHighlight2')}</span>
            </li>
            <li className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-300">
              <CheckCircle2
                size={13}
                className="shrink-0 text-[#17c981]"
                aria-hidden="true"
              />
              <span>{t('heroHighlight3')}</span>
            </li>
          </ul>
        </div>

        <HeroStage alt={t('illustration')} caption={t('courtCaption')} />
      </div>
    </section>
  );
}
