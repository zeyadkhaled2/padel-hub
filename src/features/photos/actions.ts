'use server';

import { redirect } from 'next/navigation';
import { localeValue } from '@/features/auth/types';
import { createOwnerListingDraft } from '@/features/listings/server';
import { parseCreateListingCategory } from '@/features/listings/validation';
import { verifiedClient } from '@/server/supabase/server';

export async function createPhotoDraft(locale: string, form: FormData) {
  const safeLocale = localeValue(locale);
  const client = await verifiedClient();
  const base = `/${safeLocale}/account/photos`;
  if (!client) redirect(`/${safeLocale}/auth/signin`);

  const category = parseCreateListingCategory(form.get('category'));
  if (!category) redirect(`${base}?error=invalidFile`);

  const created = await createOwnerListingDraft(client, category);
  if (!created.ok) redirect(`${base}?error=unavailable`);
  redirect(`${base}?listing=${created.listing.id}`);
}
