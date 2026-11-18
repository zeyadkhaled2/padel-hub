'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { localeValue } from '@/features/auth/types';
import { verifiedClient } from '@/server/supabase/server';
import { governorates } from '@/features/profile/types';
import { brands, textFields, type ListingState, type Listing } from './types';

export async function createListing(locale: string, form: FormData) {
  const client = await verifiedClient();
  if (!client) redirect(`/${localeValue(locale)}/auth/signin`);
  const category = form.get('category');
  if (category !== 'rackets' && category !== 'balls') return;
  const { data, error } = await client.rpc('create_listing_draft', { p_category: category });
  if (error || !data) redirect(`/${localeValue(locale)}/account/photos?error=unavailable`);
  redirect(`/${localeValue(locale)}/account/listings/${data.id}`);
}

export async function saveListing(previous: ListingState, form: FormData): Promise<ListingState> {
  const values = Object.fromEntries([...form.entries()].filter(([key, value]) => !key.startsWith('$') && typeof value === 'string')) as Record<string,string>;
  const fail = (message: string): ListingState => ({ listing: previous.listing, values, message });
  const client = await verifiedClient();
  if (!client) return fail('session');
  const id = z.uuid().safeParse(values.id);
  const version = z.coerce.number().int().positive().safeParse(values.version);
  if (!id.success || !version.success) return fail('invalid');
  const read = await client.rpc('get_my_listing', { p_listing_id: id.data });
  if (read.error || !read.data) return fail('unavailable');
  const listing = read.data as Listing;
  // Previous client state is display-only; identity, category and version come from the database.
  if (listing.version !== version.data) return fail('conflict');
  const args = { p_listing_id: id.data, p_expected_version: version.data };
  const intent = values.intent;
  if (!['save','submit','withdraw'].includes(intent)) return fail('invalid');
  if (intent === 'save') {
    const patch: Record<string, unknown> = {};
    for (const [key, limit] of Object.entries(textFields)) {
      const value = (values[key] ?? '').trim();
      if (value.length > limit) return fail('invalid');
      patch[key] = value || null;
    }
    for (const [key, choices] of Object.entries({ brand_slug: brands, governorate_slug: governorates, condition: ['new','used'], offer_type: ['sale','swap','both'] })) {
      const value = values[key] || null;
      if (value && !choices.includes(value as never)) return fail('invalid');
      patch[key] = value;
    }
    patch.price_egp = values.price_egp ? Number(values.price_egp) : null;
    if (patch.price_egp !== null && !z.number().int().min(1).max(500000).safeParse(patch.price_egp).success) return fail('invalid');
    patch.is_negotiable = values.is_negotiable === 'on';
    if (patch.brand_slug !== 'other') patch.brand_custom = null;
    if (listing.category === 'balls') { patch.offer_type = 'sale'; patch.racket_damage_repair_disclosure = null; }
    else { patch.balls_quantity_packaging = null; patch.balls_availability_note = null; }
    if (patch.offer_type === 'sale') patch.swap_preference = null;
    if (patch.offer_type === 'swap') { patch.price_egp = null; patch.is_negotiable = false; }
    const result = await client.rpc('update_listing_draft', { ...args, p_patch: patch });
    if (result.error) return fail(result.error.code === 'PT409' ? 'conflict' : 'invalid');
    return { listing: result.data, message: 'saved' };
  }
  const result = await client.rpc(intent === 'submit' ? 'submit_listing' : 'withdraw_listing', args);
  if (result.error) return fail(result.error.code === 'PT409' ? 'conflictOrLimit' : result.error.code === '23514' ? 'requirements' : 'unavailable');
  return { listing: result.data, message: intent === 'submit' ? 'submitted' : 'withdrawn' };
}
