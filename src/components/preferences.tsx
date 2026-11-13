'use client';
import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { usePathname } from '@/i18n/navigation';

const subscribe = () => () => {};
export function Preferences() {
  const t = useTranslations('shell');
  const locale = useLocale();
  const pathname = usePathname();
  const params = useSearchParams();
  const otherLocale = locale === 'en' ? 'ar' : 'en';
  const query = params.toString();
  const languageHref = `/${otherLocale}${pathname === '/' ? '' : pathname}${query ? `?${query}` : ''}`;
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return <div className="preferences">
    <label><span className="sr-only">{t('theme')}</span>
      <select aria-label={t('theme')} disabled={!mounted} value={mounted ? theme : 'system'} onChange={e => setTheme(e.target.value)}>
        <option value="system">{t('system')}</option><option value="light">{t('light')}</option><option value="dark">{t('dark')}</option>
      </select>
    </label>
    {/* Locale changes replace the document language/direction and theme bootstrap together. */}
    <a className="language" href={languageHref} lang={otherLocale}>{locale === 'en' ? 'العربية' : 'English'}</a>
  </div>;
}
