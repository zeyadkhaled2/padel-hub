'use server';

import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { localeValue } from '@/features/auth/types';
import { readFormStrings } from '@/lib/validation/shared';
import { verifiedClient } from '@/server/supabase/server';
import type { Listing, ListingEditorMessage, ListingState } from './types';
import {
  buildListingDraftPatch,
  isLifecycleAction,
  mapListingRpcError,
  parseCreateListingCategory,
  parseListingActionHeader,
} from './validation';
import {
  changeOwnerListingStatus,
  createOwnerListingDraft,
  fetchOwnerListing,
  saveOwnerListingDraft,
  submitOrWithdrawOwnerListing,
} from './server';

export async function createListing(locale: string, form: FormData) {
  const safeLocale = localeValue(locale);
  const client = await verifiedClient();
  if (!client) redirect(`/${safeLocale}/auth/signin`);

  const category = parseCreateListingCategory(form.get('category'));
  if (!category) return;

  const created = await createOwnerListingDraft(client, category);
  if (!created.ok) redirect(`/${safeLocale}/account/photos?error=unavailable`);
  redirect(`/${safeLocale}/account/listings/${created.listing.id}`);
}

async function handleDraftSave(
  client: SupabaseClient,
  listing: Listing,
  version: number,
  values: Record<string, string>,
  fail: (message: ListingEditorMessage) => ListingState,
): Promise<ListingState> {
  const built = buildListingDraftPatch(listing.category, values);
  if (!built.ok) return fail(built.error);

  const saved = await saveOwnerListingDraft(client, listing.id, version, built.patch);
  if (!saved.ok) return fail(mapListingRpcError(saved.error, 'save'));
  return { listing: saved.listing, message: 'saved' };
}

export async function saveListing(
  previous: ListingState,
  form: FormData,
): Promise<ListingState> {
  const values = readFormStrings(form);
  const fail = (message: ListingEditorMessage): ListingState => ({
    listing: previous.listing,
    values,
    message,
  });

  const client = await verifiedClient();
  if (!client) return fail('session');

  const header = parseListingActionHeader(values);
  if (!header.ok) return fail('invalid');

  // Previous client state is display-only; identity, category and version come from the database.
  const current = await fetchOwnerListing(client, header.id);
  if (current.error || !current.listing) return fail('unavailable');
  if (current.listing.version !== header.version) return fail('conflict');

  if (isLifecycleAction(header.intent)) {
    const result = await changeOwnerListingStatus(
      client,
      header.id,
      header.version,
      header.intent,
    );
    if (!result.ok) return fail(mapListingRpcError(result.error, 'transition'));
    return {
      listing: result.listing,
      message: header.intent === 'relist' ? 'submitted' : 'statusUpdated',
    };
  }

  if (header.intent === 'save') {
    return handleDraftSave(client, current.listing, header.version, values, fail);
  }

  const result = await submitOrWithdrawOwnerListing(
    client,
    header.id,
    header.version,
    header.intent,
  );
  if (!result.ok) return fail(mapListingRpcError(result.error, 'transition'));
  return {
    listing: result.listing,
    message: header.intent === 'submit' ? 'submitted' : 'withdrawn',
  };
}
