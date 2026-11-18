import { getTranslations } from 'next-intl/server';
import { ArrowUpDown, ChevronDown, Search, SlidersHorizontal } from 'lucide-react';

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
      className="grid grid-cols-2 gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_184px_210px_auto] items-end"
      role="search"
    >
      <label className="col-span-2 sm:col-span-3 lg:col-span-1 flex min-w-0 flex-col gap-1.5">
        <span className="text-[11.5px] font-bold tracking-[-0.01em] text-muted">
          {t('search')}
        </span>
        <span className="flex min-h-[44px] w-full min-w-0 items-center gap-2.5 rounded-[12px] border border-line bg-base/65 px-3.5 transition-colors hover:border-accent/50 focus-within:border-accent focus-within:bg-surface">
          <Search
            size={17}
            className="shrink-0 text-accent"
            aria-hidden="true"
          />
          <input
            name="q"
            defaultValue={query}
            placeholder={t('placeholder')}
            className="w-full min-w-0 border-0 bg-transparent py-2 text-[14px] sm:text-[14.5px] font-medium text-ink placeholder:text-muted/85 focus:outline-none"
          />
        </span>
      </label>

      <label className="col-span-1 flex min-w-0 flex-col gap-1.5">
        <span className="text-[11.5px] font-bold tracking-[-0.01em] text-muted">
          {t('category')}
        </span>
        <span className="relative flex min-h-[44px] w-full min-w-0 items-center">
          <SlidersHorizontal
            size={14}
            className="pointer-events-none absolute start-3 z-10 text-muted"
            aria-hidden="true"
          />
          <select
            name="category"
            defaultValue={category}
            className="min-h-[44px] w-full min-w-0 cursor-pointer appearance-none truncate rounded-[12px] border border-line bg-base/65 ps-8.5 pe-8 py-2 text-[13px] sm:text-[13.5px] font-semibold text-ink transition-colors hover:border-accent/55 focus:border-accent focus:bg-surface"
          >
            <option value="">{t('all')}</option>
            <option value="rackets">{t('rackets')}</option>
            <option value="balls">{t('balls')}</option>
          </select>
          <ChevronDown
            size={15}
            className="pointer-events-none absolute end-2.5 text-muted"
            aria-hidden="true"
          />
        </span>
      </label>

      <label className="col-span-1 flex min-w-0 flex-col gap-1.5">
        <span className="text-[11.5px] font-bold tracking-[-0.01em] text-muted">
          {t('sort')}
        </span>
        <span className="relative flex min-h-[44px] w-full min-w-0 items-center">
          <ArrowUpDown
            size={14}
            className="pointer-events-none absolute start-3 z-10 text-muted"
            aria-hidden="true"
          />
          <select
            name="sort"
            defaultValue={sort}
            className="min-h-[44px] w-full min-w-0 cursor-pointer appearance-none truncate rounded-[12px] border border-line bg-base/65 ps-8.5 pe-8 py-2 text-[13px] sm:text-[13.5px] font-semibold text-ink transition-colors hover:border-accent/55 focus:border-accent focus:bg-surface"
          >
            <option value="">{t('newest')}</option>
            <option value="low">{t('low')}</option>
            <option value="high">{t('high')}</option>
          </select>
          <ChevronDown
            size={15}
            className="pointer-events-none absolute end-2.5 text-muted"
            aria-hidden="true"
          />
        </span>
      </label>

      <button
        type="submit"
        className="col-span-2 sm:col-span-1 inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-[12px] bg-accent px-5.5 py-2.5 text-[14px] font-bold text-accent-ink transition-[filter,transform] duration-200 hover:brightness-105 active:translate-y-px"
      >
        {t('submit')}
      </button>
    </form>
  );
}
