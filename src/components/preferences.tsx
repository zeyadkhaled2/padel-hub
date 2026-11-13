'use client';
import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Link, usePathname } from '@/i18n/navigation';

const subscribe = () => () => {};
export function Preferences() {
  const t = useTranslations('shell');
  const locale = useLocale();
  const pathname = usePathname();
  const params = useSearchParams();
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return <div className="preferences">
    <label><span className="sr-only">{t('theme')}</span>
      <select aria-label={t('theme')} value={mounted ? theme : 'system'} onChange={e => setTheme(e.target.value)}>
        <option value="system">{t('system')}</option><option value="light">{t('light')}</option><option value="dark">{t('dark')}</option>
      </select>
    </label>
    <Link className="language" href={{ pathname, query: Object.fromEntries(params.entries()) }} locale={locale === 'en' ? 'ar' : 'en'} lang={locale === 'en' ? 'ar' : 'en'}>{locale === 'en' ? 'العربية' : 'English'}</Link>
  </div>;
}
