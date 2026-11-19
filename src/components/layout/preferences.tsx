'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Globe, Monitor, Moon, Sun } from 'lucide-react';
import { usePathname } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';

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
  const themeIcon =
    activeTheme === 'dark' ? (
      <Moon size={14} />
    ) : activeTheme === 'light' ? (
      <Sun size={14} />
    ) : (
      <Monitor size={14} />
    );

  return (
    <div className="ms-auto flex items-center gap-2 md:ms-0">
      <label className="inline-flex min-h-[44px] items-center">
        <span className="sr-only">{t('theme')}</span>
        <NativeSelect
          size="sm"
          aria-label={t('theme')}
          disabled={!mounted}
          value={activeTheme}
          onChange={(event) => setTheme(event.target.value)}
          leadingIcon={themeIcon}
          wrapperClassName="w-auto"
          className="max-w-[120px] sm:max-w-[136px]"
        >
          <NativeSelectOption value="system">{t('system')}</NativeSelectOption>
          <NativeSelectOption value="light">{t('light')}</NativeSelectOption>
          <NativeSelectOption value="dark">{t('dark')}</NativeSelectOption>
        </NativeSelect>
      </label>

      {/* Locale changes replace the document language/direction and theme bootstrap together. */}
      <Button
        asChild
        variant="outline"
        size="sm"
        className="gap-1.5 px-3 text-[12.5px] sm:text-[13px]"
      >
        <a href={languageHref} lang={otherLocale}>
          <Globe size={14} className="shrink-0 text-brand" aria-hidden="true" />
          <span>{locale === 'en' ? 'العربية' : 'English'}</span>
        </a>
      </Button>
    </div>
  );
}
