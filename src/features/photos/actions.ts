'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { localeValue } from '@/features/auth/types';
import { createOwnerListingDraft, detachOwnerListingPhoto } from '@/features/listings/server';
import { parseCreateListingCategory } from '@/features/listings/validation';
import { classifyRpcError } from '@/lib/errors/domain';
import { positiveVersionSchema, uuidSchema } from '@/lib/validation/shared';
import { verifiedClient } from '@/server/supabase/server';

export async function createPhotoDraft(locale: string, form: FormData) {
  const safeLocale = localeValue(locale);
  const client = await verifiedClient();
  const base = `/${safeLocale}/account/photos`;
  if (!client) redirect(`/${safeLocale}/auth/signin`);

  const category = parseCreateListingCategory(form.get('category'));
  if (!category) redirect(`${base}?error=invalidFile`);

  const created = await createOwnerListingDraft(client, category);
  if (!created.ok) redirect(`${base}?error=unavailable`);
  redirect(`${base}?listing=${created.listing.id}`);
}

export type DetachPhotoResult =
  | { ok: true; version: number; media_ids: string[] }
  | { ok: false; error: 'signin' | 'conflict' | 'notAllowed' | 'unavailable' };

export async function detachListingPhoto(
  locale: string,
  listingId: string,
  expectedVersion: number,
  mediaId: string,
): Promise<DetachPhotoResult> {
  const safeLocale = localeValue(locale);
  if (
    !uuidSchema.safeParse(listingId).success ||
    !uuidSchema.safeParse(mediaId).success ||
    !positiveVersionSchema.safeParse(expectedVersion).success
  ) {
    return { ok: false, error: 'unavailable' };
  }

  const client = await verifiedClient();
  if (!client) return { ok: false, error: 'signin' };

  const detached = await detachOwnerListingPhoto(client, listingId, expectedVersion, mediaId);
  if (!detached.ok) {
    const kind = classifyRpcError(detached.error);
    if (kind === 'conflict') return { ok: false, error: 'conflict' };
    if (kind === 'forbidden') return { ok: false, error: 'notAllowed' };
    return { ok: false, error: 'unavailable' };
  }

  revalidatePath(`/${safeLocale}/account/photos`);
  revalidatePath(`/${safeLocale}/account/listings`);
  revalidatePath(`/${safeLocale}/account/listings/${listingId}`);
  return {
    ok: true,
    version: detached.listing.version,
    media_ids: detached.listing.media_ids,
  };
}
