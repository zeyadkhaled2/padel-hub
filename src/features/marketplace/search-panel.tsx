import { getTranslations } from 'next-intl/server';
import { Search } from 'lucide-react';

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
    <form
      key={`${query}|${category}|${sort}`}
      className="grid grid-cols-2 gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_164px_196px_auto] items-end"
      role="search"
    >
      <label className="col-span-2 sm:col-span-3 lg:col-span-1 flex min-w-0 flex-col gap-1">
        <span className="text-[11.5px] font-semibold text-muted">
          {t('search')}
        </span>
        <span className="flex min-h-[44px] w-full min-w-0 items-center gap-2.5 rounded-[11px] border border-line bg-base/60 px-3 transition-colors focus-within:border-accent focus-within:bg-surface">
          <Search size={18} className="shrink-0 text-accent" aria-hidden="true" />
          <input
            name="q"
            defaultValue={query}
            placeholder={t('placeholder')}
            className="w-full min-w-0 border-0 bg-transparent py-2 text-[14.5px] text-ink placeholder:text-muted/90 focus:outline-none"
          />
        </span>
      </label>

      <label className="col-span-1 flex min-w-0 flex-col gap-1">
        <span className="text-[11.5px] font-semibold text-muted">
          {t('category')}
        </span>
        <select
          name="category"
          defaultValue={category}
          className="min-h-[44px] w-full min-w-0 rounded-[11px] border border-line bg-base/60 px-3 py-2 text-[13.5px] font-medium text-ink transition-colors hover:border-accent/60 focus:border-accent focus:bg-surface"
        >
          <option value="">{t('all')}</option>
          <option value="rackets">{t('rackets')}</option>
          <option value="balls">{t('balls')}</option>
        </select>
      </label>

      <label className="col-span-1 flex min-w-0 flex-col gap-1">
        <span className="text-[11.5px] font-semibold text-muted">
          {t('sort')}
        </span>
        <select
          name="sort"
          defaultValue={sort}
          className="min-h-[44px] w-full min-w-0 rounded-[11px] border border-line bg-base/60 px-3 py-2 text-[13.5px] font-medium text-ink transition-colors hover:border-accent/60 focus:border-accent focus:bg-surface"
        >
          <option value="">{t('newest')}</option>
          <option value="low">{t('low')}</option>
          <option value="high">{t('high')}</option>
        </select>
      </label>

      <button
        type="submit"
        className="col-span-2 sm:col-span-1 inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-[11px] bg-accent px-5 py-2.5 text-[14px] font-semibold text-accent-ink transition-[filter] duration-200 hover:brightness-95"
      >
        {t('submit')}
      </button>
    </form>
  );
}
