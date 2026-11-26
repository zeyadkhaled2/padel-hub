'use server';

import { revalidatePath } from 'next/cache';
import { localeValue } from '@/features/auth/types';
import { readFormStrings } from '@/lib/validation/shared';
import { verifiedClient } from '@/server/supabase/server';
import type {
  AccountDeletionState,
  ProfileFieldErrors,
  ProfileMessage,
  ProfileState,
} from './types';
import { fetchMyProfileBundle } from './server';
import {
  mapProfileRpcError,
  parseAccountDeletionInput,
  parseAccountDeletionRequest,
  parseProfileBundle,
  parseProfileMutation,
} from './validation';

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

export async function requestAccountDeletion(
  locale: string,
  previous: AccountDeletionState,
  form: FormData,
): Promise<AccountDeletionState> {
  const parsed = parseAccountDeletionInput(form);
  if (!parsed.ok) {
    return {
      request: previous.request,
      message: parsed.message,
      reason: parsed.reason,
    };
  }

  const client = await verifiedClient();
  if (!client) {
    return {
      request: previous.request,
      message: 'sessionExpired',
      reason: parsed.reason,
    };
  }

  const { data, error } = await client.rpc('request_account_deletion', {
    p_reason: parsed.reason,
  });
  if (error) {
    return {
      request: previous.request,
      message: 'failed',
      reason: parsed.reason,
    };
  }

  const saved = parseAccountDeletionRequest(data);
  if (!saved) {
    return {
      request: previous.request,
      message: 'failed',
      reason: parsed.reason,
    };
  }

  revalidatePath(`/${localeValue(locale)}/account`);
  return {
    request: saved,
    message: 'requested',
    reason: '',
  };
}
