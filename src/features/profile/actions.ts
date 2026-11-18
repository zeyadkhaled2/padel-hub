'use server';

import { z } from 'zod';
import { verifiedClient } from '@/server/supabase/server';
import { governorates, type Profile, type ProfileState } from './types';

const username = z.string().regex(/^[A-Za-z0-9_]{3,24}$/);
const details = z.object({
  display_name: z.string().trim().min(1).max(80),
  governorate_slug: z.enum(governorates),
  account_type: z.enum(['individual', 'business']),
});
const version = z.coerce.number().int().positive();
const optionalText = (limit: number) => z.string().trim().max(limit).transform(value => value || null);

export async function saveProfile(_previous: ProfileState, form: FormData): Promise<ProfileState> {
  // Never authorize using previous state, hidden owner IDs, or browser metadata.
  const client = await verifiedClient();
  if (!client) return { profile: null, message: 'sessionExpired' };
  const { data: existing, error: readError } = await client.rpc('get_my_profile_bundle');
  if (readError) return { profile: null, message: 'loadFailed' };
  const profile = existing as Profile | null;
  const intent = String(form.get('intent') ?? '');
  const values = Object.fromEntries([...form.entries()].filter(([key, value]) => !key.startsWith('$') && typeof value === 'string')) as Record<string, string>;
  const fail = (message: string, errors?: Record<string, string>): ProfileState => ({ profile, message, errors, values, intent });
  let rpc: string;
  let args: Record<string, unknown>;
  if (intent === 'create') {
    const parsed = details.extend({ username }).safeParse(values);
    if (!parsed.success) return fail('invalidFields', Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), issue.path[0] === 'username' ? 'usernameHint' : 'invalidField'])));
    rpc = 'create_seller_profile';
    args = { p_username: parsed.data.username, p_display_name: parsed.data.display_name, p_governorate_slug: parsed.data.governorate_slug, p_account_type: parsed.data.account_type };
  } else {
    const expected = version.safeParse(values.version);
    if (!profile || !expected.success) return fail('conflict');
    if (intent === 'details') {
      const parsed = details.extend({ bio: optionalText(500), district_text: optionalText(80), favorite_racket: optionalText(120) }).safeParse(values);
      if (!parsed.success) return fail('invalidFields', Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), 'invalidField'])));
      rpc = 'update_seller_profile';
      args = { p_expected_version: expected.data, p_patch: { ...parsed.data, is_public: values.is_public === 'on' } };
    } else if (intent === 'contact') {
      const phone = (values.whatsapp_e164 ?? '').trim();
      const contactVersion = version.safeParse(values.contact_version);
      if (!contactVersion.success) return fail('conflict');
      if ((phone && !/^\+[1-9][0-9]{7,14}$/.test(phone)) || (!phone && values.public_contact_consent === 'on')) return fail('invalidFields', { whatsapp_e164: 'phoneHint' });
      rpc = 'update_my_contact';
      args = { p_expected_profile_version: expected.data, p_expected_contact_version: contactVersion.data, p_whatsapp_e164: phone || null, p_public_contact_consent: values.public_contact_consent === 'on' };
    } else return fail('invalidFields');
  }
  const { data, error } = await client.rpc(rpc, args);
  if (error) {
    if (error.code === 'PT409') return fail('conflict');
    if (error.code === '23505') return fail('usernameUnavailable', { username: 'usernameUnavailable' });
    if (error.code === '42501') return fail('notAllowed');
    return fail('saveFailed');
  }
  return { profile: data as Profile, message: 'saved', intent };
}
