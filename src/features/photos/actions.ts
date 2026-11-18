'use server';
import { redirect } from 'next/navigation';
import { verifiedClient } from '@/server/supabase/server';
import { localeValue } from '@/features/auth/types';
export async function createPhotoDraft(locale: string, form: FormData) {
  const client = await verifiedClient();
  const base = `/${localeValue(locale)}/account/photos`;
  if (!client) redirect(`/${localeValue(locale)}/auth/signin`);
  const category = form.get('category');
  if (!['rackets','balls','shoes','bags'].includes(String(category))) redirect(`${base}?error=invalidFile`);
  const { data, error } = await client.rpc('create_listing_draft', { p_category: category });
  if (error || !data) redirect(`${base}?error=unavailable`);
  redirect(`${base}?listing=${data.id}`);
}
