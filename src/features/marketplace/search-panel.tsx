import { getTranslations } from 'next-intl/server';
import { ArrowUpDown, Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';

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
      <div className="col-span-2 sm:col-span-3 lg:col-span-1 flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="market-search-q">{t('search')}</Label>
        <div className="relative flex w-full min-w-0 items-center">
          <Search
            size={17}
            className="pointer-events-none absolute start-3.5 z-10 shrink-0 text-brand"
            aria-hidden="true"
          />
          <Input
            id="market-search-q"
            name="q"
            defaultValue={query}
            placeholder={t('placeholder')}
            className="ps-10"
          />
        </div>
      </div>

      <div className="col-span-1 flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="market-search-category">{t('category')}</Label>
        <NativeSelect
          id="market-search-category"
          name="category"
          defaultValue={category}
          leadingIcon={<SlidersHorizontal size={14} />}
        >
          <NativeSelectOption value="">{t('all')}</NativeSelectOption>
          <NativeSelectOption value="rackets">{t('rackets')}</NativeSelectOption>
          <NativeSelectOption value="balls">{t('balls')}</NativeSelectOption>
        </NativeSelect>
      </div>

      <div className="col-span-1 flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="market-search-sort">{t('sort')}</Label>
        <NativeSelect
          id="market-search-sort"
          name="sort"
          defaultValue={sort}
          leadingIcon={<ArrowUpDown size={14} />}
        >
          <NativeSelectOption value="">{t('newest')}</NativeSelectOption>
          <NativeSelectOption value="low">{t('low')}</NativeSelectOption>
          <NativeSelectOption value="high">{t('high')}</NativeSelectOption>
        </NativeSelect>
      </div>

      <Button type="submit" className="col-span-2 sm:col-span-1 px-5.5">
        {t('submit')}
      </Button>
    </form>
  );
}
