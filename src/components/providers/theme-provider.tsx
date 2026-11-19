'use client';

import type { ReactNode } from 'react';
import { Direction } from 'radix-ui';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

interface ThemeProviderProps {
  children: ReactNode;
  dir: 'ltr' | 'rtl';
}

export function ThemeProvider({ children, dir }: ThemeProviderProps) {
  return (
    <Direction.DirectionProvider dir={dir}>
      <NextThemesProvider
        attribute="data-theme"
        defaultTheme="system"
        enableSystem
      >
        {children}
      </NextThemesProvider>
    </Direction.DirectionProvider>
  );
}
