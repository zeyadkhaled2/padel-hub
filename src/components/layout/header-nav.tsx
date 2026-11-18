'use client';

import { Link, usePathname } from '@/i18n/navigation';

interface HeaderNavProps {
  ariaLabel: string;
  exploreLabel: string;
  howLabel: string;
}

export function HeaderNav({
  ariaLabel,
  exploreLabel,
  howLabel,
}: HeaderNavProps) {
  const pathname = usePathname();
  const isExplore = pathname === '/' || pathname.startsWith('/equipment') || pathname.startsWith('/sellers');
  const isAbout = pathname.startsWith('/about');

  return (
    <nav
      aria-label={ariaLabel}
      className="order-3 flex w-full items-center gap-1 border-t border-line/70 pt-2 md:order-none md:w-auto md:border-t-0 md:pt-0"
    >
      <Link
        href="/"
        aria-current={isExplore ? 'page' : undefined}
        className={`inline-flex min-h-[40px] md:min-h-[40px] items-center rounded-[10px] px-3.5 text-[13.5px] font-semibold transition-colors ${
          isExplore
            ? 'bg-surface-soft text-accent'
            : 'text-muted hover:bg-base hover:text-ink'
        }`}
      >
        {exploreLabel}
      </Link>
      <Link
        href="/about"
        aria-current={isAbout ? 'page' : undefined}
        className={`inline-flex min-h-[40px] md:min-h-[40px] items-center rounded-[10px] px-3.5 text-[13.5px] font-semibold transition-colors ${
          isAbout
            ? 'bg-surface-soft text-accent'
            : 'text-muted hover:bg-base hover:text-ink'
        }`}
      >
        {howLabel}
      </Link>
    </nav>
  );
}
