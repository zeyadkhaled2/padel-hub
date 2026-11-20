'use server';

import { readFormStrings } from '@/lib/validation/shared';
import { verifiedClient } from '@/server/supabase/server';
import type { ProfileFieldErrors, ProfileMessage, ProfileState } from './types';
import { fetchMyProfileBundle } from './server';
import { mapProfileRpcError, parseProfileBundle, parseProfileMutation } from './validation';

export async function saveProfile(
  _previous: ProfileState,
  form: FormData,
): Promise<ProfileState> {
  // Never authorize using previous state, hidden owner IDs, or browser metadata.
  const client = await verifiedClient();
  if (!client) return { profile: null, message: 'sessionExpired' };

  const current = await fetchMyProfileBundle(client);
  if (current.error) return { profile: null, message: 'loadFailed' };

  const profile = current.profile;
  const values = readFormStrings(form);
  const intent = values.intent ?? '';
  const fail = (message: ProfileMessage, errors?: ProfileFieldErrors): ProfileState => ({
    profile,
    message,
    errors,
    values,
    intent,
  });

  const command = parseProfileMutation(values, profile !== null);
  if (!command.ok) return fail(command.message, command.errors);

  const { data, error } = await client.rpc(command.rpc, command.args);
  if (error) {
    const mapped = mapProfileRpcError(error);
    return fail(mapped.message, mapped.errors);
  }

  const savedProfile = parseProfileBundle(data);
  if (!savedProfile) return fail('saveFailed');
  return { profile: savedProfile, message: 'saved', intent };
}
