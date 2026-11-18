'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { ChevronDown, Globe, Monitor, Moon, Sun } from 'lucide-react';
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
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const activeTheme = mounted ? (theme ?? 'system') : 'system';

  return (
    <div className="ms-auto flex items-center gap-2 md:ms-0">
      <label className="relative inline-flex min-h-[44px] items-center">
        <span className="sr-only">{t('theme')}</span>
        <span
          className="pointer-events-none absolute start-2.5 z-10 text-muted"
          aria-hidden="true"
        >
          {activeTheme === 'dark' ? (
            <Moon size={14} />
          ) : activeTheme === 'light' ? (
            <Sun size={14} />
          ) : (
            <Monitor size={14} />
          )}
        </span>
        <select
          aria-label={t('theme')}
          disabled={!mounted}
          value={activeTheme}
          onChange={(event) => setTheme(event.target.value)}
          className="min-h-[40px] max-w-[120px] sm:max-w-[136px] cursor-pointer appearance-none rounded-[10px] border border-line bg-base/75 ps-8 pe-7 text-[12.5px] sm:text-[13px] font-semibold text-ink transition-colors hover:border-accent/60 hover:bg-surface focus:border-accent focus:bg-surface disabled:opacity-70"
        >
          <option value="system">{t('system')}</option>
          <option value="light">{t('light')}</option>
          <option value="dark">{t('dark')}</option>
        </select>
        <ChevronDown
          size={14}
          className="pointer-events-none absolute end-2.5 text-muted"
          aria-hidden="true"
        />
      </label>

      {/* Locale changes replace the document language/direction and theme bootstrap together. */}
      <a
        href={languageHref}
        lang={otherLocale}
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[10px] border border-line bg-base/75 px-3 text-[12.5px] sm:text-[13px] font-semibold text-ink transition-colors hover:border-accent/60 hover:bg-surface hover:text-accent"
      >
        <Globe size={14} className="shrink-0 text-accent" aria-hidden="true" />
        <span>{locale === 'en' ? 'العربية' : 'English'}</span>
      </a>
    </div>
  );
}
