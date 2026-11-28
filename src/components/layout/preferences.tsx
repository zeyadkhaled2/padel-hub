'use client';

import { useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { usePathname } from '@/i18n/navigation';

const subscribe = () => () => {};
const themeOptions = [
  { value: 'system', Icon: Monitor },
  { value: 'light', Icon: Sun },
  { value: 'dark', Icon: Moon },
] as const;

export function Preferences() {
  const t = useTranslations('shell');
  const locale = useLocale();
  const pathname = usePathname();
  const params = useSearchParams();

  const otherLocale = locale === 'en' ? 'ar' : 'en';
  const query = params.toString();
  const languageHref = `/${otherLocale}${pathname === '/' ? '' : pathname}${query ? `?${query}` : ''}`;

  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  return (
    <div className="preferences">
      <fieldset className="theme-switch" disabled={!mounted}>
        <legend className="sr-only">{t('theme')}</legend>
        {themeOptions.map(({ value, Icon }) => (
          <label className="theme-option" key={value} title={t(value)}>
            <input
              type="radio"
              name="color-theme"
              value={value}
              checked={mounted && theme === value}
              onChange={() => setTheme(value)}
            />
            <span className="theme-option-face">
              <Icon size={17} aria-hidden />
              <span className="sr-only">{t(value)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {/* Locale changes replace the document language/direction and theme bootstrap together. */}
      <a className="language" href={languageHref} lang={otherLocale} hrefLang={otherLocale} dir="auto" translate="no">
        {locale === 'en' ? 'العربية' : 'English'}
      </a>
    </div>
  );
}
