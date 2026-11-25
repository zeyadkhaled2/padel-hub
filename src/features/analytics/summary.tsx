import { getLocale, getTranslations } from 'next-intl/server';
import { BarChart3 } from 'lucide-react';
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
    <section aria-label={t('title')} className="disclosure seller-analytics-card">
      <div className="seller-analytics-head">
        <div className="detail-panel-head seller-analytics-title-wrap">
          <span className="detail-panel-icon" aria-hidden>
            <BarChart3 size={18} />
          </span>
          <div>
            <h2>{t('title')}</h2>
            <p className="detail-panel-subtitle">{t(admin ? 'adminHint' : 'hint')}</p>
          </div>
        </div>

        {!metrics ? (
          <p role="status" className="field-hint">
            {t('unavailable')}
          </p>
        ) : (
          <dl className="seller-analytics-metrics">
            <div className="seller-metric-pill">
              <dt>{t('views')}</dt>
              <dd>{metrics.views.toLocaleString(locale)}</dd>
            </div>
            {metrics.scope === 'admin' && (
              <div className="seller-metric-pill">
                <dt>{t('contacts')}</dt>
                <dd>{metrics.contacts.toLocaleString(locale)}</dd>
              </div>
            )}
          </dl>
        )}
      </div>
      <p className="field-hint seller-analytics-notice">{t('notice')}</p>
    </section>
  );
}
