'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

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
      className="order-3 flex w-full items-center gap-1 border-t border-border/70 pt-2 md:order-none md:w-auto md:border-t-0 md:pt-0"
    >
      <Button
        asChild
        variant={isExplore ? 'soft' : 'ghost'}
        size="sm"
        className="text-[13.5px]"
      >
        <Link href="/" aria-current={isExplore ? 'page' : undefined}>
          {exploreLabel}
        </Link>
      </Button>
      <Button
        asChild
        variant={isAbout ? 'soft' : 'ghost'}
        size="sm"
        className="text-[13.5px]"
      >
        <Link href="/about" aria-current={isAbout ? 'page' : undefined}>
          {howLabel}
        </Link>
      </Button>
    </nav>
  );
}
