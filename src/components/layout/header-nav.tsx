'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

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
  const isExplore =
    pathname === '/' ||
    pathname.startsWith('/equipment') ||
    pathname.startsWith('/sellers');
  const isAbout = pathname.startsWith('/about');

  return (
    <nav
      aria-label={ariaLabel}
      className="order-3 flex w-full items-center gap-5 border-t border-border pt-1 md:order-none md:w-auto md:gap-7 md:border-t-0 md:pt-0"
    >
      <Link
        href="/"
        aria-current={isExplore ? 'page' : undefined}
        className={cn(
          'inline-flex min-h-[40px] md:min-h-[64px] items-center border-b-2 text-[13.5px] sm:text-[14px] transition-colors duration-150',
          isExplore
            ? 'border-foreground font-bold text-foreground'
            : 'border-transparent font-medium text-muted-foreground hover:text-foreground',
        )}
      >
        {exploreLabel}
      </Link>
      <Link
        href="/about"
        aria-current={isAbout ? 'page' : undefined}
        className={cn(
          'inline-flex min-h-[40px] md:min-h-[64px] items-center border-b-2 text-[13.5px] sm:text-[14px] transition-colors duration-150',
          isAbout
            ? 'border-foreground font-bold text-foreground'
            : 'border-transparent font-medium text-muted-foreground hover:text-foreground',
        )}
      >
        {howLabel}
      </Link>
    </nav>
  );
}
