import { getTranslations } from 'next-intl/server';
import { governorates } from '@/features/profile/types';
import { brands } from '@/features/listings/types';
import { Search, SlidersHorizontal } from 'lucide-react';

interface SearchPanelProps {
  query: string;
  category: string;
  sort: string; values?: Record<string,string>;
}

export async function SearchPanel({
  query,
  category,
  sort, values,
}: SearchPanelProps) {
  const t = await getTranslations('market');
  const b = await getTranslations('buyer');
  const e = await getTranslations('listingEditor');
  const a = await getTranslations('account');

  return (
    <form className="search-panel" role="search">
      <div className="search-row">
        <label className="search-field">
          <span>{t('search')}</span>
          <div>
            <Search size={21} aria-hidden />
            <input
              name="q"
              maxLength={120}
              defaultValue={query}
              placeholder={t('placeholder')}
            />
          </div>
        </label>

        <button className="button primary" type="submit">
          {t('submit')}
        </button>
      </div>

      <details className="filters" open={Boolean(category || sort || (values && Object.values(values).some(Boolean)))}>
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
          {values && <>
            {Object.entries({ governorate: governorates, brand: brands, condition: ['new','used'], offer: ['sale','swap','both'] }).map(([key, options]) => <label key={key}>{b(key)}<select aria-label={b(key)} name={key} defaultValue={values[key]}><option value="">{t('all')}</option>{options.map(option => <option key={option} value={option}>{key === 'governorate' ? a(`governorates.${option}`) : key === 'brand' && option !== 'other' ? option.replaceAll('_',' ') : e(option)}</option>)}</select></label>)}
            {['min','max'].map(key => <label key={key}>{b(key)}<input type="number" name={key} min="0" max="500000" step="1" defaultValue={values[key]} /></label>)}
          </>}
        </div>
        {values && <p className="field-hint">{b('priceHint')}</p>}
      </details>
    </form>
  );
}
