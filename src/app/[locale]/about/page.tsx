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

      <section
        id="open-source-notices"
        aria-labelledby="open-source-notices-heading"
        className="seller-card"
      >
        <h2 id="open-source-notices-heading">{t('openSourceHeading')}</h2>
        <p className="field-hint">{t('openSourceLibheifBody')}</p>
        <div className="photo-upload-actions">
          <a href="/licenses/libheif-js-NOTICE.txt" className="button secondary">
            {t('openSourceNoticeLink')}
          </a>
          <a href="/licenses/libheif-js-LICENSE.txt" className="button secondary">
            {t('openSourceLicenseLink')}
          </a>
        </div>
      </section>

      <Link href="/" className="button primary">
        {t('back')}
      </Link>
    </main>
  );
}
