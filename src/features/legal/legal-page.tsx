import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export type LegalDocumentKind = 'privacy' | 'terms';

const PRIVACY_SECTIONS = [
  'collect',
  'photos',
  'contact',
  'analytics',
  'providers',
  'retention',
  'deletion',
] as const;

const TERMS_SECTIONS = [
  'role',
  'accounts',
  'listings',
  'moderation',
  'conduct',
  'liability',
  'termination',
] as const;

export async function legalMetadata(
  locale: string,
  kind: LegalDocumentKind,
): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: `legal.${kind}` });
  const shell = await getTranslations({ locale, namespace: 'shell' });
  return {
    title: `${t('title')} — ${shell('brandName')}`,
    description: t('subtitle'),
  };
}

export async function LegalPage({ kind }: { kind: LegalDocumentKind }) {
  const [t, legal, market] = await Promise.all([
    getTranslations(`legal.${kind}`),
    getTranslations('legal'),
    getTranslations('market'),
  ]);

  const sectionKeys = kind === 'privacy' ? PRIVACY_SECTIONS : TERMS_SECTIONS;
  const siblingHref = kind === 'privacy' ? '/terms' : '/privacy';
  const siblingLabel = kind === 'privacy' ? legal('terms.title') : legal('privacy.title');

  return (
    <main id="main" className="container legal-page">
      <article className="legal-doc">
        <header className="legal-header">
          <p className="eyebrow">{legal('eyebrow')}</p>
          <h1>{t('title')}</h1>
          <p className="hero-intro">{t('subtitle')}</p>
          <p className="legal-updated">{legal('effectiveDate')}</p>
        </header>

        <div className="legal-sections">
          {sectionKeys.map((key) => (
            <section
              key={key}
              aria-labelledby={`legal-${kind}-${key}`}
              className="seller-card legal-section"
            >
              <h2 id={`legal-${kind}-${key}`}>{t(`sections.${key}.heading`)}</h2>
              <p>{t(`sections.${key}.body`)}</p>
            </section>
          ))}
        </div>

        <footer className="legal-footer-actions">
          <Link href="/" className="button primary">
            {market('back')}
          </Link>
          <Link href={siblingHref} className="button secondary">
            {siblingLabel}
          </Link>
          {kind === 'privacy' && (
            <Link href="/account#account-deletion" className="button secondary" prefetch={false}>
              {legal('goToDeletion')}
            </Link>
          )}
        </footer>
      </article>
    </main>
  );
}
