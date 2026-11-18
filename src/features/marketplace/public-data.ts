import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { authConfig } from '@/server/supabase/config';
import { z } from 'zod';

export type PublicListing = {
  id: string; title: string; category: string; status: string; brand_slug: string; brand_custom: string | null;
  model: string; description: string; governorate_slug: string; district_text: string | null; condition: string;
  condition_disclosure: string; offer_type: string; price_egp: number | null; is_negotiable: boolean;
  swap_preference: string | null; racket_damage_repair_disclosure: string | null; racket_year: number | null;
  racket_shape: string | null; racket_weight_grams: number | null; racket_purchase_date: string | null;
  balls_quantity_packaging: string | null; balls_availability_note: string | null;
  last_confirmed_available_at: string | null; media_ids: string[];
  seller: { display_name: string; username: string; account_type: string };
};
export type Query = Record<string, string | string[] | undefined>;
export function publicClient(service = false) {
  const config = authConfig();
  const key = service ? process.env.PADELHUB_SUPABASE_SERVICE_ROLE_KEY : config?.key;
  if (!config || !key) return null;
  return createClient(config.url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(10000) }) } });
}
export function searchValues(query: Query) {
  return Object.fromEntries(['q','category','governorate','brand','condition','offer','min','max','sort','page'].map(key => [key, typeof query[key] === 'string' ? query[key] : ''])) as Record<string,string>;
}
export async function searchPublic(values: Record<string,string>) {
  const client = publicClient();
  if (!client) return { items: [] as PublicListing[], total: 0, unavailable: true };
  const integer = (value: string, fallback: number | null) => value === '' ? fallback : /^\d{1,6}$/.test(value) ? Number(value) : -1;
  const page = integer(values.page, 1);
  const min = integer(values.min, null), max = integer(values.max, null);
  if (!page || page < 1 || page > 10000 || min === -1 || max === -1 || values.q.length > 120) return { items: [], total: 0, invalid: true };
  const { data, error } = await client.rpc('search_public_listings', { p_query: values.q, p_category: values.category, p_governorate: values.governorate, p_brand: values.brand, p_condition: values.condition, p_offer: values.offer, p_min: min, p_max: max, p_sort: values.sort, p_page: page });
  if (error) return { items: [], total: 0, invalid: error.code === '22023', unavailable: error.code !== '22023' };
  return data as { items: PublicListing[]; total: number; invalid?: boolean; unavailable?: boolean };
}
export async function publicListing(id: string) {
  if (!z.uuid().safeParse(id).success) return { data: null, error: null };
  const client = publicClient();
  if (!client) return { data: null, error: true };
  return client.rpc('get_public_listing', { p_listing: id });
}
