import { getTranslations } from 'next-intl/server';
import { CircleDot, Grid2X2 } from 'lucide-react';
import { Link } from '@/i18n/navigation';

interface CategoryPillsProps {
  query: string;
  category: string;
  sort: string; base?: string; values?: Record<string,string>;
}

const CATEGORIES = ['', 'rackets', 'balls', 'shoes', 'bags'] as const;

export async function CategoryPills({
  query,
  category,
  sort, base = "/", values = {},
}: CategoryPillsProps) {
  const t = await getTranslations('market');

  return (
    <div className="category-links" role="group" aria-label={t('category')}>
      {CATEGORIES.map((item, index) => {
        const isSelected =
          category === item ||
          (!['rackets', 'balls', 'shoes', 'bags'].includes(category) && !item);

        return (
          <Link
            key={item || 'all'}
            prefetch={false}
            href={{
              pathname: base,
              query: {
                ...values, page: undefined, category: undefined,
                ...(query ? { q: query } : {}),
                ...(sort ? { sort } : {}),
                ...(item ? { category: item } : {}),
              },
              hash: 'equipment-heading',
            }}
            className={`category-link ${isSelected ? 'selected' : ''}`}
            aria-current={category === item ? 'true' : undefined}
          >
            {index === 0 ? (
              <Grid2X2 size={18} aria-hidden />
            ) : (
              <CircleDot size={18} aria-hidden />
            )}
            {t(item || 'all')}
          </Link>
        );
      })}
    </div>
  );
}
