import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export default async function AboutPage() {
  const t = await getTranslations('market');
  return <main id="main" className="container detail-page"><p className="eyebrow">PadelHub</p><h1>{t('aboutTitle')}</h1><p className="hero-intro">{t('aboutIntro')}</p><div className="steps">{(['step1', 'step2', 'step3'] as const).map((key, i) => <section key={key}><span className="step-number">{i + 1}</span><h2>{t(key)}</h2><p>{t(`${key}Body`)}</p></section>)}</div><p className="notice">{t('status')}</p><Link href="/" className="button primary">{t('back')}</Link></main>;
}
