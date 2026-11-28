import { getTranslations } from 'next-intl/server';
import {
  Circle,
  CircleDot,
  Footprints,
  Grid2X2,
  ShoppingBag,
} from 'lucide-react';
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

function renderCategoryIcon(category: '' | EquipmentCategory) {
  switch (category) {
    case '':
      return <Grid2X2 size={16} aria-hidden />;
    case 'rackets':
      return <CircleDot size={16} aria-hidden />;
    case 'balls':
      return <Circle size={16} aria-hidden />;
    case 'shoes':
      return <Footprints size={16} aria-hidden />;
    case 'bags':
      return <ShoppingBag size={16} aria-hidden />;
  }
}

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
      {PILL_CATEGORIES.map((item) => {
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
            aria-current={isSelected ? 'true' : undefined}
          >
            {renderCategoryIcon(item)}
            <span>{t(item || 'all')}</span>
          </Link>
        );
      })}
    </div>
  );
}
