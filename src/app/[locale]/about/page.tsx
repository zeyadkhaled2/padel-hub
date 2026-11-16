import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { HowItWorksSection } from '@/components/sections/how-it-works-section';
import { FeaturesSection } from '@/components/sections/features-section';
import { FaqSection } from '@/components/sections/faq-section';

export default async function AboutPage() {
  const t = await getTranslations('market');

  return (
    <main id="main" className="container detail-page">
      <h1>{t('aboutTitle')}</h1>
      <p className="hero-intro">{t('aboutIntro')}</p>

      <HowItWorksSection showHeader={false} />

      <FeaturesSection />

      <FaqSection />

      <p className="notice">{t('status')}</p>

      <Link href="/" className="button primary">
        {t('back')}
      </Link>
    </main>
  );
}
