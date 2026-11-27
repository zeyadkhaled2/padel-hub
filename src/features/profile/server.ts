import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { usernameSchema } from '@/lib/validation/shared';
import { anonClient } from '@/server/supabase/clients';
import type { AccountDeletionRequest, Profile, PublicProfile } from './types';
import {
  parseAccountDeletionRequest,
  parseProfileBundle,
  parsePublicProfile,
} from './validation';

export async function fetchMyAccountDeletionRequest(
  client: SupabaseClient,
): Promise<{ request: AccountDeletionRequest | null; error: boolean }> {
  const { data, error } = await client.rpc('get_my_account_deletion_request');
  if (error) return { request: null, error: true };
  if (data === null || data === undefined) return { request: null, error: false };
  const request = parseAccountDeletionRequest(data);
  if (!request) return { request: null, error: true };
  return { request, error: false };
}

export async function fetchMyProfileBundle(
  client: SupabaseClient,
): Promise<{ profile: Profile | null; error: boolean }> {
  const { data, error } = await client.rpc('get_my_profile_bundle');
  if (error) return { profile: null, error: true };
  if (data === null || data === undefined) return { profile: null, error: false };
  const profile = parseProfileBundle(data);
  if (!profile) return { profile: null, error: true };
  return { profile, error: false };
}

export async function fetchPublicProfile(
  username: string,
  page: number,
): Promise<
  | { status: 'ok'; profile: PublicProfile }
  | { status: 'not_found' }
  | { status: 'unavailable' }
> {
  const client = anonClient();
  if (!client) return { status: 'unavailable' };

  const { data, error } = await client.rpc('get_public_profile', {
    p_username: username,
    p_page: page,
  });
  if (error) return { status: 'unavailable' };
  if (data === null || data === undefined) return { status: 'not_found' };

  const profile = parsePublicProfile(data);
  if (!profile) return { status: 'unavailable' };
  return { status: 'ok', profile };
}

export async function resolvePublicProfileUsername(
  publicId: string,
): Promise<
  | { status: 'ok'; username: string }
  | { status: 'not_found' }
  | { status: 'unavailable' }
> {
  const client = anonClient();
  if (!client) return { status: 'unavailable' };

  const { data, error } = await client.rpc('resolve_public_profile', {
    p_public_id: publicId,
  });
  if (error) return { status: 'unavailable' };
  if (data === null || data === undefined) return { status: 'not_found' };

  const parsed = usernameSchema.safeParse(data);
  if (!parsed.success) return { status: 'unavailable' };
  return { status: 'ok', username: parsed.data };
}
