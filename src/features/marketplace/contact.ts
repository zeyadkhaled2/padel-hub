import 'server-only';
import { z } from 'zod';
import { getTranslations } from 'next-intl/server';
import { authConfig } from '@/server/supabase/config';
import { publicClient } from './public-data';

const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
export async function contact(request: Request, id: string) {
  const locale = new URL(request.url).searchParams.get('locale') === 'ar' ? 'ar' : 'en';
  const t = await getTranslations({ locale, namespace: 'buyer' });
  if (!z.uuid().safeParse(id).success) return new Response(t('noContact'), { status: 404, headers });
  const client = publicClient(true), config = authConfig();
  if (!client || !config) return new Response(t('unavailable'), { status: 503, headers });
  const { data, error } = await client.rpc('get_listing_contact', { p_listing: id });
  if (error) return new Response(t('unavailable'), { status: 503, headers });
  if (!data || !/^\+[1-9][0-9]{7,14}$/.test(data.phone)) return new Response(t('noContact'), { status: 404, headers });
  const destination = new URL(`https://wa.me/${data.phone.slice(1)}`);
  destination.searchParams.set('text', t('message', { title: data.title, url: `${config.origin}/${locale}/equipment/${id}` }));
  return new Response(null, { status: 302, headers: { ...headers, Location: destination.href } });
}
