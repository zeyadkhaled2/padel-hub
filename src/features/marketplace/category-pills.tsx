import { getTranslations } from 'next-intl/server';
import { CircleDot, LayoutGrid } from 'lucide-react';
import { Link } from '@/i18n/navigation';
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
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-[12px] px-2.5 sm:px-3 py-1.5 text-[12.5px] sm:text-[13px] font-bold transition-colors duration-200 ${
              isSelected
                ? 'bg-ink text-base dark:bg-hero dark:text-hero-ink'
                : 'border border-line bg-base/70 text-ink hover:border-accent/60 hover:bg-surface-soft/75'
            }`}
            aria-current={category === item ? 'true' : undefined}
          >
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-[7px] ${
                isSelected
                  ? 'bg-base/15 text-base dark:bg-hero-ink/12 dark:text-hero-ink'
                  : 'bg-surface text-accent'
              }`}
              aria-hidden="true"
            >
              {item === '' ? (
                <LayoutGrid size={13} aria-hidden="true" />
              ) : item === 'rackets' ? (
                <PadelRacketIcon />
              ) : (
                <CircleDot size={13} aria-hidden="true" />
              )}
            </span>

            <span>{t(key)}</span>

            <span
              aria-hidden="true"
              className={`rounded-[6px] px-1.5 py-0.5 text-[11px] font-extrabold tabular-nums leading-none ${
                isSelected
                  ? 'bg-base/15 text-base dark:bg-hero-ink/12 dark:text-hero-ink'
                  : 'bg-surface-soft text-muted'
              }`}
            >
              {itemCount}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
