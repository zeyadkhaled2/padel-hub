import { getTranslations } from 'next-intl/server';
import { CircleDot, Grid2X2 } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import {
  EQUIPMENT_CATEGORIES,
  isEquipmentCategory,
  type EquipmentCategory,
} from '@/lib/domain/equipment';
import { buildCategoryPillQuery } from './search';
import type { MarketplaceSearchValues } from './types';

interface CategoryPillsProps {
  query: string;
  category: string;
  sort: string;
  base?: string;
  values?: Partial<MarketplaceSearchValues>;
}

const PILL_CATEGORIES: readonly ('' | EquipmentCategory)[] = ['', ...EQUIPMENT_CATEGORIES];

export async function CategoryPills({
  query,
  category,
  sort,
  base = '/',
  values = {},
}: CategoryPillsProps) {
  const t = await getTranslations('market');

  return (
    <div className="category-links" role="group" aria-label={t('category')}>
      {PILL_CATEGORIES.map((item, index) => {
        const isSelected = category === item || (!isEquipmentCategory(category) && !item);

        return (
          <Link
            key={item || 'all'}
            prefetch={false}
            href={{
              pathname: base,
              query: buildCategoryPillQuery(item, query, sort, values),
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
