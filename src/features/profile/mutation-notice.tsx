import { AlertTriangle, Info } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export async function MutationNotice({
  error = false,
  showLink = true,
}: {
  error?: boolean;
  showLink?: boolean;
}) {
  const t = await getTranslations('account');
  return (
    <div
      role={error ? 'alert' : 'status'}
      className={`seller-feedback-banner ${error ? 'is-error' : 'is-info'}`}
    >
      {error ? <AlertTriangle size={16} aria-hidden /> : <Info size={16} aria-hidden />}
      <div>
        <p>{error ? t('deletion.loadFailed') : t('deletion.readOnly')}</p>
        {showLink && (
          <p className="seller-status-action">
            <Link href="/account#account-deletion" className="text-link">
              {t('deletion.title')}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
