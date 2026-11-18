import { getTranslations } from 'next-intl/server';
import { MapPin, CheckCircle2 } from 'lucide-react';
import { HeroStage } from './hero-stage';

export async function HeroSection() {
  const t = await getTranslations('market');

  return (
    <section className="mt-3 mb-3 md:mt-4 md:mb-4 grid grid-cols-1 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] items-stretch overflow-hidden rounded-[16px] md:rounded-[20px] bg-hero text-hero-ink">
      <div className="min-w-0 self-center px-4 py-3.5 md:px-7 md:py-5 lg:px-8 lg:py-5">
        <h1 className="max-w-[500px] text-[clamp(1.5rem,6.4vw,2rem)] md:text-[clamp(1.85rem,2.6vw,2.45rem)] font-extrabold leading-[1.08] tracking-[-0.03em] rtl:leading-[1.32] rtl:tracking-normal">
          {t('title')}
        </h1>

        <p className="mt-1.5 md:mt-2 max-w-[460px] text-[13.5px] md:text-[15px] leading-[1.5] md:leading-[1.55] text-hero-ink">
          {t('intro')}
        </p>

        <ul
          className="mt-3 hidden md:flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0"
          aria-label={t('badge')}
        >
          <li className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-hero-ink">
            <MapPin size={14} aria-hidden="true" />
            <span>{t('badge')}</span>
          </li>
          <li className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-hero-ink">
            <CheckCircle2 size={14} aria-hidden="true" />
            <span>{t('heroHighlight1')}</span>
          </li>
          <li className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-hero-ink">
            <CheckCircle2 size={14} aria-hidden="true" />
            <span>{t('heroHighlight2')}</span>
          </li>
          <li className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-hero-ink">
            <CheckCircle2 size={14} aria-hidden="true" />
            <span>{t('heroHighlight3')}</span>
          </li>
        </ul>
      </div>

      <HeroStage alt={t('illustration')} caption={t('courtCaption')} />
    </section>
  );
}
