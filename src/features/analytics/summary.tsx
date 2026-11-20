import { getLocale, getTranslations } from 'next-intl/server';
import { verifiedClient } from '@/server/supabase/server';
import { parseListingMetrics } from './validation';

export async function AnalyticsSummary({ admin = false }: { admin?: boolean }) {
  const t = await getTranslations('analytics');
  const locale = await getLocale();
  const client = await verifiedClient();
  if (!client) return null;

  const { data, error } = await client.rpc('get_listing_metrics', { p_admin: admin });
  const metrics = error ? null : parseListingMetrics(data, admin);

  return (
    <section aria-label={t('title')} className="disclosure">
      <h2>{t('title')}</h2>
      <p>{t(admin ? 'adminHint' : 'hint')}</p>
      {!metrics ? (
        <p role="status">{t('unavailable')}</p>
      ) : (
        <dl className="review-details">
          <div>
            <dt>{t('views')}</dt>
            <dd>{metrics.views.toLocaleString(locale)}</dd>
          </div>
          {metrics.scope === 'admin' && (
            <div>
              <dt>{t('contacts')}</dt>
              <dd>{metrics.contacts.toLocaleString(locale)}</dd>
            </div>
          )}
        </dl>
      )}
      <p className="field-hint">{t('notice')}</p>
    </section>
  );
}
