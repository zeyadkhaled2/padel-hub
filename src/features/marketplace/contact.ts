import 'server-only';
import { after } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { recordMetric } from '@/features/analytics/record';
import { uuidSchema } from '@/lib/validation/shared';
import { authConfig } from '@/server/supabase/config';
import { serviceClient } from '@/server/supabase/clients';
import { buildWhatsAppDestination, parseListingContact } from './search';

const CONTACT_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

export async function contact(request: Request, id: string) {
  const locale = new URL(request.url).searchParams.get('locale') === 'ar' ? 'ar' : 'en';
  const t = await getTranslations({ locale, namespace: 'buyer' });

  if (!uuidSchema.safeParse(id).success) {
    return new Response(t('noContact'), { status: 404, headers: CONTACT_HEADERS });
  }

  const client = serviceClient();
  const config = authConfig();
  if (!client || !config) {
    return new Response(t('unavailable'), { status: 503, headers: CONTACT_HEADERS });
  }

  const { data, error } = await client.rpc('get_listing_contact', { p_listing: id });
  if (error) {
    return new Response(t('unavailable'), { status: 503, headers: CONTACT_HEADERS });
  }

  const parsedContact = parseListingContact(data);
  if (!parsedContact) {
    return new Response(t('noContact'), { status: 404, headers: CONTACT_HEADERS });
  }

  const messageText = t('message', {
    title: parsedContact.title,
    url: `${config.origin}/${locale}/equipment/${id}`,
  });
  const destination = buildWhatsAppDestination(parsedContact.phone, messageText);
  if (!destination) {
    return new Response(t('noContact'), { status: 404, headers: CONTACT_HEADERS });
  }

  if (request.method === 'GET') {
    after(() => recordMetric(id, 'contact'));
  }

  return new Response(null, {
    status: 302,
    headers: { ...CONTACT_HEADERS, Location: destination },
  });
}
