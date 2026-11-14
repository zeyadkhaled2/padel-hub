import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Brand } from '@/components/brand';

export async function SiteFooter() {
  const t = await getTranslations('shell');

  return (
    <footer className="container site-footer">
      <div className="footer-brand-block">
        <Brand />
        <p className="footer-tagline">{t('footerTagline')}</p>
      </div>

      <div className="footer-meta-block">
        <div className="footer-links">
          <Link href="/">{t('explore')}</Link>
          <Link href="/about">{t('how')}</Link>
        </div>
        <p>{t('demo')}</p>
        <span className="footer-signoff">{t('made')}</span>
      </div>
    </footer>
  );
}
