import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EquipmentCategory, ListingLifecycleAction } from '@/lib/domain/equipment';
import type { RpcErrorLike } from '@/lib/errors/domain';
import type {
  Listing,
  ListingDraftPatch,
  ListingRejectionDecision,
  OwnerListingSummary,
  PhotoDraftSummary,
} from './types';
import {
  parseListingDecision,
  parseOwnerListing,
  parseOwnerListingSummaries,
  parsePhotoDraftSummaries,
} from './validation';

export type ListingMutationResult =
  | { ok: true; listing: Listing }
  | { ok: false; error: RpcErrorLike };

export async function fetchOwnerListing(
  client: SupabaseClient,
  listingId: string,
): Promise<{ listing: Listing | null; error: boolean }> {
  const { data, error } = await client.rpc('get_my_listing', { p_listing_id: listingId });
  if (error) return { listing: null, error: true };
  if (data === null || data === undefined) return { listing: null, error: false };
  const listing = parseOwnerListing(data);
  if (!listing) return { listing: null, error: true };
  return { listing, error: false };
}

export async function fetchOwnerListings(
  client: SupabaseClient,
): Promise<{ items: OwnerListingSummary[]; error: boolean }> {
  const { data, error } = await client.rpc('get_my_listings');
  if (error) return { items: [], error: true };
  const parsed = parseOwnerListingSummaries(data ?? []);
  if (!parsed) return { items: [], error: true };
  return { items: parsed, error: false };
}

export async function fetchOwnerPhotoDrafts(
  client: SupabaseClient,
): Promise<{ items: PhotoDraftSummary[]; error: boolean }> {
  const { data, error } = await client.rpc('get_my_photo_drafts');
  if (error) return { items: [], error: true };
  const parsed = parsePhotoDraftSummaries(data ?? []);
  if (!parsed) return { items: [], error: true };
  return { items: parsed, error: false };
}

export async function fetchOwnerListingDecision(
  client: SupabaseClient,
  listingId: string,
): Promise<{ decision: ListingRejectionDecision | null; error: boolean }> {
  const { data, error } = await client.rpc('get_my_listing_decision', { p_listing: listingId });
  if (error) return { decision: null, error: true };
  return { decision: parseListingDecision(data), error: false };
}

export async function createOwnerListingDraft(
  client: SupabaseClient,
  category: EquipmentCategory,
): Promise<ListingMutationResult> {
  const { data, error } = await client.rpc('create_listing_draft', { p_category: category });
  if (error) return { ok: false, error };
  const listing = parseOwnerListing(data);
  if (!listing) return { ok: false, error: null };
  return { ok: true, listing };
}

export async function saveOwnerListingDraft(
  client: SupabaseClient,
  listingId: string,
  expectedVersion: number,
  patch: ListingDraftPatch,
): Promise<ListingMutationResult> {
  const { data, error } = await client.rpc('update_listing_draft', {
    p_listing_id: listingId,
    p_expected_version: expectedVersion,
    p_patch: patch,
  });
  if (error) return { ok: false, error };
  const listing = parseOwnerListing(data);
  if (!listing) return { ok: false, error: null };
  return { ok: true, listing };
}

export async function changeOwnerListingStatus(
  client: SupabaseClient,
  listingId: string,
  expectedVersion: number,
  action: ListingLifecycleAction,
): Promise<ListingMutationResult> {
  const { data, error } = await client.rpc('change_listing_status', {
    p_listing_id: listingId,
    p_expected_version: expectedVersion,
    p_action: action,
  });
  if (error) return { ok: false, error };
  const listing = parseOwnerListing(data);
  if (!listing) return { ok: false, error: null };
  return { ok: true, listing };
}

export async function submitOrWithdrawOwnerListing(
  client: SupabaseClient,
  listingId: string,
  expectedVersion: number,
  intent: 'submit' | 'withdraw',
): Promise<ListingMutationResult> {
  const rpcName = intent === 'submit' ? 'submit_listing' : 'withdraw_listing';
  const { data, error } = await client.rpc(rpcName, {
    p_listing_id: listingId,
    p_expected_version: expectedVersion,
  });
  if (error) return { ok: false, error };
  const listing = parseOwnerListing(data);
  if (!listing) return { ok: false, error: null };
  return { ok: true, listing };
}

export async function detachOwnerListingPhoto(
  client: SupabaseClient,
  listingId: string,
  expectedVersion: number,
  mediaId: string,
): Promise<ListingMutationResult> {
  const { data, error } = await client.rpc('detach_listing_photo', {
    p_listing_id: listingId,
    p_expected_version: expectedVersion,
    p_media_id: mediaId,
  });
  if (error) return { ok: false, error };
  const listing = parseOwnerListing(data);
  if (!listing) return { ok: false, error: null };
  return { ok: true, listing };
}
