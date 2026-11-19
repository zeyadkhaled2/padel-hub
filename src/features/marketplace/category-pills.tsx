import { getTranslations } from 'next-intl/server';
import { CircleDot, LayoutGrid } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { demoListings } from './demo-data';

interface CategoryCounts {
  all: number;
  rackets: number;
  balls: number;
}

interface CategoryPillsProps {
  query: string;
  category: string;
  sort: string;
  counts?: CategoryCounts;
}

const CATEGORIES = ['', 'rackets', 'balls'] as const;

function PadelRacketIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3c4.2 0 7 3.1 7 7.1 0 3.5-2.1 6-5.2 6.8L13 19v2h-2v-2l-.8-2.1C7.1 16.1 5 13.6 5 10.1 5 6.1 7.8 3 12 3Z" />
      <circle cx="10" cy="8.5" r="0.6" fill="currentColor" />
      <circle cx="14" cy="8.5" r="0.6" fill="currentColor" />
      <circle cx="12" cy="11.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

const defaultCounts: CategoryCounts = {
  all: demoListings.length,
  rackets: demoListings.filter((item) => item.category === 'rackets').length,
  balls: demoListings.filter((item) => item.category === 'balls').length,
};

export async function CategoryPills({
  query,
  category,
  sort,
  counts = defaultCounts,
}: CategoryPillsProps) {
  const t = await getTranslations('market');

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label={t('category')}
    >
      {CATEGORIES.map((item) => {
        const key = item || 'all';
        const isSelected =
          category === item ||
          (!['rackets', 'balls'].includes(category) && !item);
        const itemCount = counts[key];

        return (
          <Link
            key={key}
            prefetch={false}
            href={{
              pathname: '/',
              query: {
                ...(query ? { q: query } : {}),
                ...(sort ? { sort } : {}),
                ...(item ? { category: item } : {}),
              },
              hash: 'equipment-heading',
            }}
            className={cn(
              'inline-flex min-h-[36px] items-center gap-2 rounded-[6px] border px-3 py-1 text-[12.5px] sm:text-[13px] font-semibold transition-colors duration-150',
              isSelected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-foreground hover:border-border-strong hover:bg-muted',
            )}
            aria-current={category === item ? 'true' : undefined}
          >
            <span
              className={cn(
                'inline-flex items-center justify-center',
                isSelected ? 'text-primary-foreground/85' : 'text-brand',
              )}
              aria-hidden="true"
            >
              {item === '' ? (
                <LayoutGrid size={14} aria-hidden="true" />
              ) : item === 'rackets' ? (
                <PadelRacketIcon />
              ) : (
                <CircleDot size={14} aria-hidden="true" />
              )}
            </span>

            <span>{t(key)}</span>

            <span
              aria-hidden="true"
              className={cn(
                'rounded-[4px] px-1.5 py-0.5 text-[11px] font-bold tabular-nums leading-none',
                isSelected
                  ? 'bg-primary-foreground/15 text-primary-foreground'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {itemCount}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
