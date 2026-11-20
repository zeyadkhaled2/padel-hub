import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { notFound, redirect } from 'next/navigation';
import { localeValue } from '@/features/auth/types';
import { verifiedClient } from '@/server/supabase/server';
import type { AdminAccess, PendingListingsPage, ReviewSnapshot } from './types';
import {
  parseAdminAccess,
  parsePendingListingsPage,
  parseReviewSnapshot,
} from './validation';

export type AdminGateResult =
  | { status: 'ok'; client: SupabaseClient; access: AdminAccess }
  | { status: 'unavailable'; client: SupabaseClient };

export async function requireAdminAccess(
  locale: string,
  options: { requireMfa?: boolean } = {},
): Promise<AdminGateResult> {
  const safeLocale = localeValue(locale);
  const client = await verifiedClient();
  if (!client) redirect(`/${safeLocale}/auth/signin`);

  const response = await client.rpc('get_my_admin_access');
  if (response.error) return { status: 'unavailable', client };

  const access = parseAdminAccess(response.data);
  if (!access) return { status: 'unavailable', client };
  if (!access.is_admin) notFound();
  if (options.requireMfa && !access.mfa_verified) redirect(`/${safeLocale}/admin`);

  return { status: 'ok', client, access };
}

export async function fetchPendingListings(
  client: SupabaseClient,
  page: number,
): Promise<{ page: PendingListingsPage | null; error: boolean }> {
  const { data, error } = await client.rpc('admin_pending_listings', { p_page: page });
  if (error) return { page: null, error: true };
  const parsed = parsePendingListingsPage(data);
  if (!parsed) return { page: null, error: true };
  return { page: parsed, error: false };
}

export async function fetchListingReviewSnapshot(
  client: SupabaseClient,
  listingId: string,
): Promise<{ snapshot: ReviewSnapshot | null; error: boolean }> {
  const { data, error } = await client.rpc('admin_get_listing_review', {
    p_listing_id: listingId,
  });
  if (error) return { snapshot: null, error: true };
  const snapshot = parseReviewSnapshot(data);
  if (!snapshot) return { snapshot: null, error: true };
  return { snapshot, error: false };
}
