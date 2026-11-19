import { getLocale, getTranslations } from 'next-intl/server';
import { verifiedClient } from '@/server/supabase/server';

export async function AnalyticsSummary({ admin = false }: { admin?: boolean }) {
  const t = await getTranslations('analytics');
  const locale = await getLocale();
  const client = await verifiedClient();
  if (!client) return null;
  const { data, error } = await client.rpc('get_listing_metrics', { p_admin: admin });
  return <section aria-label={t('title')} className="disclosure">
    <h2>{t('title')}</h2><p>{t(admin ? 'adminHint' : 'hint')}</p>
    {error ? <p role="status">{t('unavailable')}</p> : <dl className="review-details">
      <div><dt>{t('views')}</dt><dd>{Number(data.views).toLocaleString(locale)}</dd></div>
      <div><dt>{t('contacts')}</dt><dd>{Number(data.contacts).toLocaleString(locale)}</dd></div>
    </dl>}
    <p className="field-hint">{t('notice')}</p>
  </section>;
}
