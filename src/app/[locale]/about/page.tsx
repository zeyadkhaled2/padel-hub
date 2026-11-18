import { getTranslations } from 'next-intl/server';
import { ArrowLeft, Info } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { HowItWorksSection } from '@/components/sections/how-it-works-section';
import { FeaturesSection } from '@/components/sections/features-section';
import { FaqSection } from '@/components/sections/faq-section';

export default async function AboutPage() {
  const t = await getTranslations('market');

  return (
    <main id="main" className="container py-8 pb-16 md:py-12 md:pb-20">
      <div className="max-w-[680px]">
        <h1 className="font-display text-[clamp(2rem,4.4vw,3.1rem)] font-extrabold leading-[1.1] tracking-[-0.03em] text-ink">
          {t('aboutTitle')}
        </h1>
        <p className="mt-3.5 text-[16px] sm:text-[17.5px] leading-[1.65] text-muted">
          {t('aboutIntro')}
        </p>
      </div>

      <HowItWorksSection showHeader={false} />

      <FeaturesSection />

      <FaqSection />

      <div className="my-8 flex items-start gap-3 rounded-[16px] bg-surface-soft/80 p-4 sm:p-5 text-[14px] font-medium leading-relaxed text-ink">
        <Info
          size={18}
          className="mt-0.5 shrink-0 text-accent"
          aria-hidden="true"
        />
        <p>{t('status')}</p>
      </div>

      <Link
        href="/"
        className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[12px] bg-accent px-5.5 py-2.5 text-[14px] font-bold text-accent-ink transition-[filter] duration-200 hover:brightness-105"
      >
        <ArrowLeft
          size={16}
          className="shrink-0 rtl:rotate-180"
          aria-hidden="true"
        />
        <span>{t('back')}</span>
      </Link>
    </main>
  );
}
