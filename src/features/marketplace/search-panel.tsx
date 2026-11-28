import { getTranslations } from 'next-intl/server';
import { Search, SlidersHorizontal } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import {
  CURATED_BRANDS,
  EGYPT_GOVERNORATES,
  EQUIPMENT_CATEGORIES,
  LISTING_CONDITIONS,
  LISTING_PRICE_BOUNDS,
  MAX_SEARCH_QUERY_LENGTH,
  OFFER_TYPES,
  SHOE_SIZES_EU,
  formatBrandLabel,
  type BrandSlug,
} from '@/lib/domain/equipment';
import type { MarketplaceSearchValues } from './types';

interface SearchPanelProps {
  query: string;
  category: string;
  sort: string;
  values?: MarketplaceSearchValues;
  base?: '/' | '/demo';
}

const SELECT_FILTERS = [
  { key: 'governorate', options: EGYPT_GOVERNORATES },
  { key: 'brand', options: CURATED_BRANDS },
  { key: 'condition', options: LISTING_CONDITIONS },
  { key: 'offer', options: OFFER_TYPES },
] as const;

export async function SearchPanel({
  query,
  category,
  sort,
  values,
  base = '/',
}: SearchPanelProps) {
  const t = await getTranslations('market');
  const b = await getTranslations('buyer');
  const e = await getTranslations('listingEditor');
  const a = await getTranslations('account');

  const activeFilterCount = [
    category,
    sort,
    values?.size,
    values?.governorate,
    values?.brand,
    values?.condition,
    values?.offer,
    values?.min,
    values?.max,
  ].filter(Boolean).length;

  return (
    <form
      key={JSON.stringify({ query, category, sort, values })}
      className="search-panel"
      role="search"
      action="#equipment-heading"
    >
      <div className="search-row">
        <label className="search-field">
          <span>{t('search')}</span>
          <div>
            <Search size={19} aria-hidden />
            <input
              name="q"
              enterKeyHint="search"
              maxLength={MAX_SEARCH_QUERY_LENGTH}
              defaultValue={query}
              placeholder={t('placeholder')}
            />
          </div>
        </label>

        <button className="button primary" type="submit">
          {t('submit')}
        </button>
      </div>

      <details
        className="filters"
        open={Boolean(activeFilterCount > 0)}
      >
        <summary>
          <SlidersHorizontal size={15} aria-hidden />
          <span>{t('filters')}</span>
          {activeFilterCount > 0 ? (
            <span className="filters-count-pill">
              <span aria-hidden>{activeFilterCount}</span>
              <span className="sr-only">{t('activeFilters', { count: activeFilterCount })}</span>
            </span>
          ) : null}
        </summary>

        <div className="filter-fields">
          <label>
            {t('category')}
            <select name="category" defaultValue={category}>
              <option value="">{t('all')}</option>
              {EQUIPMENT_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {t(item)}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t('sort')}
            <select name="sort" defaultValue={sort}>
              <option value="">{t('newest')}</option>
              <option value="low">{t('low')}</option>
              <option value="high">{t('high')}</option>
            </select>
          </label>

          {values && (
            <>
              <label>
                {e('shoe_size_eu')}
                <select aria-label={e('shoe_size_eu')} name="size" defaultValue={values.size}>
                  <option value="">{b('anySize')}</option>
                  {SHOE_SIZES_EU.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>

              {SELECT_FILTERS.map(({ key, options }) => (
                <label key={key}>
                  {b(key)}
                  <select aria-label={b(key)} name={key} defaultValue={values[key]}>
                    <option value="">{t('all')}</option>
                    {options.map((option) => (
                      <option key={option} value={option}>
                        {key === 'governorate'
                          ? a(`governorates.${option}`)
                          : key === 'brand' && option !== 'other'
                            ? formatBrandLabel(option as BrandSlug)
                            : e(option)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}

              {(['min', 'max'] as const).map((key) => (
                <label key={key}>
                  {b(key)}
                  <input
                    type="number"
                    name={key}
                    min={LISTING_PRICE_BOUNDS.searchMin}
                    max={LISTING_PRICE_BOUNDS.max}
                    step="1"
                    defaultValue={values[key]}
                  />
                </label>
              ))}
            </>
          )}
        </div>
        {values && <p className="field-hint">{b('priceHint')}</p>}
        <div className="filter-actions">
          <button className="button primary" type="submit">{t('applyFilters')}</button>
          <Link href={{ pathname: base, hash: 'equipment-heading' }} className="button secondary">
            {t('reset')}
          </Link>
        </div>
      </details>
    </form>
  );
}
