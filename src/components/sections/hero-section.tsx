import { getTranslations } from 'next-intl/server';
import { MapPin, CheckCircle2 } from 'lucide-react';
import { HeroStage } from './hero-stage';

export async function HeroSection() {
  const t = await getTranslations('market');

  return (
    <section className="mt-4 mb-3.5 md:mt-8 md:mb-6 grid grid-cols-1 md:grid-cols-2 items-stretch overflow-hidden rounded-[16px] md:rounded-[24px] bg-hero text-hero-ink">
      <div className="min-w-0 self-center px-[22px] py-5 md:p-7 lg:p-11">
        <h1 className="max-w-[480px] text-[clamp(1.95rem,8.5vw,2.6rem)] md:text-[clamp(2.3rem,3.6vw,3.75rem)] font-extrabold leading-[1.06] tracking-[-0.035em] rtl:leading-[1.35] rtl:tracking-normal">
          {t('title')}
        </h1>

        <p className="mt-3 md:mt-5 max-w-[440px] text-[14px] md:text-[17px] leading-[1.6] md:leading-[1.65] text-hero-ink">
          {t('intro')}
        </p>

        <ul
          className="mt-6 hidden md:flex list-none flex-wrap gap-x-[18px] gap-y-2.5 p-0"
          aria-label={t('badge')}
        >
          <li className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-hero-ink">
            <MapPin size={15} aria-hidden="true" />
            <span>{t('badge')}</span>
          </li>
          <li className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-hero-ink">
            <CheckCircle2 size={15} aria-hidden="true" />
            <span>{t('heroHighlight1')}</span>
          </li>
          <li className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-hero-ink">
            <CheckCircle2 size={15} aria-hidden="true" />
            <span>{t('heroHighlight2')}</span>
          </li>
          <li className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-hero-ink">
            <CheckCircle2 size={15} aria-hidden="true" />
            <span>{t('heroHighlight3')}</span>
          </li>
        </ul>
      </div>

      <HeroStage alt={t('illustration')} caption={t('courtCaption')} />
    </section>
  );
}
