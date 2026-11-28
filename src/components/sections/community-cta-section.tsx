import { getTranslations } from 'next-intl/server';
import { HeartHandshake, ArrowUpRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';

export async function CommunityCtaSection() {
  const t = await getTranslations('market');

  return (
    <aside className="community-banner">
      <HeartHandshake size={32} aria-hidden />
      <div>
        <h2>{t('tipTitle')}</h2>
        <p>{t('tip')}</p>
      </div>
      <Link href="/account/listings" prefetch={false} className="text-link">
        {t('learn')}
        <ArrowUpRight size={18} aria-hidden />
      </Link>
    </aside>
  );
}
