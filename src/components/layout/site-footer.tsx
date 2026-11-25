import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { BrandLogo } from './brand-logo';

export async function SiteFooter() {
  const t = await getTranslations('shell');

  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div className="footer-brand-block">
          <BrandLogo label={t('brandName')} />
          <p className="footer-tagline">{t('footerTagline')}</p>
          <p className="footer-trust-pill">{t('footerSafetyNote')}</p>
        </div>

        <div className="footer-meta-block">
          <div className="footer-links">
            <Link href="/">{t('explore')}</Link>
            <Link href="/about">{t('how')}</Link>
            <Link href="/account" prefetch={false}>
              {t('account')}
            </Link>
            <Link href="/account/listings" prefetch={false}>
              {t('sell')}
            </Link>
            <Link href="/about#open-source-notices">{t('openSourceNotices')}</Link>
          </div>
          <Link href="/demo" className="footer-demo-link">
            {t('demoLink')}
          </Link>
          <span className="footer-signoff">{t('made')}</span>
        </div>
      </div>
    </footer>
  );
}
