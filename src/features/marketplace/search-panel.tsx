import { getTranslations } from 'next-intl/server';
import { Search, SlidersHorizontal } from 'lucide-react';

interface SearchPanelProps {
  query: string;
  category: string;
  sort: string;
}

export async function SearchPanel({
  query,
  category,
  sort,
}: SearchPanelProps) {
  const t = await getTranslations('market');

  return (
    <form className="search-panel" role="search">
      <div className="search-row">
        <label className="search-field">
          <span>{t('search')}</span>
          <div>
            <Search size={21} aria-hidden />
            <input
              name="q"
              defaultValue={query}
              placeholder={t('placeholder')}
            />
          </div>
        </label>

        <button className="button primary" type="submit">
          {t('submit')}
        </button>
      </div>

      <details className="filters" open={Boolean(category || sort)}>
        <summary>
          <SlidersHorizontal size={16} aria-hidden />
          {t('filters')}
        </summary>

        <div className="filter-fields">
          <label>
            {t('category')}
            <select name="category" defaultValue={category}>
              <option value="">{t('all')}</option>
              <option value="rackets">{t('rackets')}</option>
              <option value="balls">{t('balls')}</option>
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
        </div>
      </details>
    </form>
  );
}
