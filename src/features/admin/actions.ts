'use server';

import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { localeValue } from '@/features/auth/types';
import { verifiedClient } from '@/server/supabase/server';
import { inventoryReturnHref } from './inventory';
import {
  mapAdminSellerRpcError,
  parseAccountTypeUpdateForm,
  parseListingLimitUpdateForm,
  parseSellerModerationForm,
  sellersReturnHref,
  type SellerActionState,
} from './sellers';
import { MODERATION_NOTE_MAX_LENGTH } from '@/lib/domain/equipment';
import { uuidSchema } from '@/lib/validation/shared';
import type { MfaState, ReviewDecisionState, ReviewSnapshot } from './types';
import {
  mapAdminDecisionRpcError,
  parseAdminAccess,
  parseReviewDecision,
  parseTotpVerification,
} from './validation';

export type { MfaState, ReviewDecisionState, ReviewSnapshot } from './types';

async function enrollAdminTotpFactor(client: SupabaseClient): Promise<MfaState> {
  const factors = await client.auth.mfa.listFactors();
  if (factors.error) return { message: 'unavailable' };
  if (factors.data.totp.length > 0) return { message: 'alreadyEnrolled' };

  const staleUnverified = factors.data.all.filter(
    (factor) => factor.factor_type === 'totp' && factor.status === 'unverified',
  );
  for (const factor of staleUnverified) {
    const removal = await client.auth.mfa.unenroll({ factorId: factor.id });
    if (removal.error) return { message: 'unavailable' };
  }

  const enrolled = await client.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Raketna admin',
  });
  if (enrolled.error) return { message: 'unavailable' };

  return { factor: enrolled.data.id, secret: enrolled.data.totp.secret };
}

async function verifyAdminTotpFactor(
  client: SupabaseClient,
  locale: string,
  previous: MfaState,
  form: FormData,
): Promise<MfaState> {
  const factors = await client.auth.mfa.listFactors();
  if (factors.error) return { message: 'unavailable' };

  const allowedTotpIds = factors.data.all
    .filter((factor) => factor.factor_type === 'totp')
    .map((factor) => factor.id);

  const parsed = parseTotpVerification(
    String(form.get('factor') ?? ''),
    String(form.get('code') ?? ''),
    allowedTotpIds,
  );
  if (!parsed.ok) return { ...previous, message: 'invalidCode' };

  const verified = await client.auth.mfa.challengeAndVerify({
    factorId: parsed.factorId,
    code: parsed.code,
  });
  if (verified.error) return { ...previous, message: 'invalidCode' };

  redirect(`/${localeValue(locale)}/admin`);
}

export async function verifyAdmin(
  locale: string,
  previous: MfaState,
  form: FormData,
): Promise<MfaState> {
  const client = await verifiedClient();
  if (!client) return { message: 'signin' };

  const accessResponse = await client.rpc('get_my_admin_access');
  const access = accessResponse.error ? null : parseAdminAccess(accessResponse.data);
  if (!access?.is_admin) return { message: 'denied' };
  if (access.mfa_verified) redirect(`/${localeValue(locale)}/admin`);

  if (form.get('intent') === 'enroll') {
    return enrollAdminTotpFactor(client);
  }
  return verifyAdminTotpFactor(client, locale, previous, form);
}

export async function decideListing(
  locale: string,
  snapshot: ReviewSnapshot,
  _previous: ReviewDecisionState,
  form: FormData,
  returnTo = '/admin/listings?status=pending&sort=pending',
): Promise<ReviewDecisionState> {
  const client = await verifiedClient();
  if (!client) return { message: 'signin' };

  const parsed = parseReviewDecision(snapshot, form);
  if (!parsed.ok) {
    return { message: parsed.message, reason: parsed.reason };
  }

  const baseArgs = {
    p_listing_id: snapshot.listing.id,
    p_expected_listing_version: snapshot.listing.version,
    p_expected_content_version: snapshot.listing.content_version,
    p_expected_profile_version: snapshot.profile.version,
    p_reviewed_manifest: snapshot.media_manifest,
  };

  const result =
    parsed.intent === 'approve'
      ? await client.rpc('admin_approve_listing', baseArgs)
      : await client.rpc('admin_reject_listing', { ...baseArgs, p_reason: parsed.reason });

  if (result.error) {
    return {
      message: mapAdminDecisionRpcError(result.error),
      reason: parsed.reason,
    };
  }

  const destination = inventoryReturnHref(returnTo);
  redirect(`/${localeValue(locale)}${destination}${destination.includes('?') ? '&' : '?'}done=1`);
}

export async function removeListing(locale: string, snapshot: ReviewSnapshot, _state: ReviewDecisionState, form: FormData, returnTo: string): Promise<ReviewDecisionState> {
  const reason = String(form.get('reason') ?? '').trim();
  if (!reason || reason.length > MODERATION_NOTE_MAX_LENGTH) return { message: 'reasonRequired', reason };
  const client = await verifiedClient();
  if (!client) return { message: 'signin', reason };
  const result = await client.rpc('admin_remove_listing', {
    p_listing_id: snapshot.listing.id, p_expected_listing_version: snapshot.listing.version,
    p_expected_content_version: snapshot.listing.content_version, p_expected_profile_version: snapshot.profile.version,
    p_reviewed_manifest: snapshot.media_manifest, p_reason: reason,
  });
  if (result.error) return { message: mapAdminDecisionRpcError(result.error), reason };
  const destination = inventoryReturnHref(returnTo);
  redirect(`/${localeValue(locale)}${destination}${destination.includes('?') ? '&' : '?'}done=1`);
}

function sellerDetailRedirect(locale: string, sellerPublicId: string, done: string, returnTo: string): string {
  const safeReturn = sellersReturnHref(returnTo);
  const params = new URLSearchParams({ done });
  if (safeReturn !== '/admin/sellers') params.set('returnTo', safeReturn);
  return `/${localeValue(locale)}/admin/sellers/${sellerPublicId}?${params}`;
}

export async function updateSellerAccountType(
  locale: string,
  sellerPublicId: string,
  expectedVersion: number,
  returnTo: string,
  _previous: SellerActionState,
  form: FormData,
): Promise<SellerActionState> {
  if (!uuidSchema.safeParse(sellerPublicId).success || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
    return { message: 'invalidInput' };
  }
  const parsed = parseAccountTypeUpdateForm(form);
  if (!parsed.ok) {
    return { message: parsed.message, reason: parsed.reason };
  }
  const client = await verifiedClient();
  if (!client) return { message: 'signin', reason: parsed.reason, targetType: parsed.accountType };

  const result = await client.rpc('admin_update_seller_account_type', {
    p_seller_public_id: sellerPublicId,
    p_expected_version: expectedVersion,
    p_account_type: parsed.accountType,
    p_reason: parsed.reason,
  });
  if (result.error) {
    return {
      message: mapAdminSellerRpcError(result.error),
      reason: parsed.reason,
      targetType: parsed.accountType,
    };
  }
  redirect(sellerDetailRedirect(locale, sellerPublicId, 'account_type', returnTo));
}

export async function updateSellerListingLimit(
  locale: string,
  sellerPublicId: string,
  expectedVersion: number,
  returnTo: string,
  _previous: SellerActionState,
  form: FormData,
): Promise<SellerActionState> {
  if (!uuidSchema.safeParse(sellerPublicId).success || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
    return { message: 'invalidInput' };
  }
  const parsed = parseListingLimitUpdateForm(form);
  if (!parsed.ok) {
    return { message: parsed.message, reason: parsed.reason, limitInput: parsed.limitInput };
  }
  const client = await verifiedClient();
  if (!client) return { message: 'signin', reason: parsed.reason, limitInput: parsed.limitInput };

  const result = await client.rpc('admin_update_seller_listing_limit', {
    p_seller_public_id: sellerPublicId,
    p_expected_version: expectedVersion,
    p_limit_override: parsed.limitOverride,
    p_reason: parsed.reason,
  });
  if (result.error) {
    return {
      message: mapAdminSellerRpcError(result.error),
      reason: parsed.reason,
      limitInput: parsed.limitInput,
    };
  }
  redirect(
    sellerDetailRedirect(
      locale,
      sellerPublicId,
      parsed.intent === 'reset' ? 'allowance_reset' : 'allowance',
      returnTo,
    ),
  );
}

export async function moderateSellerStatus(
  locale: string,
  sellerPublicId: string,
  expectedVersion: number,
  returnTo: string,
  _previous: SellerActionState,
  form: FormData,
): Promise<SellerActionState> {
  if (!uuidSchema.safeParse(sellerPublicId).success || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
    return { message: 'invalidInput' };
  }
  const parsed = parseSellerModerationForm(form);
  if (!parsed.ok) {
    return { message: parsed.message, reason: parsed.reason, targetStatus: parsed.targetStatus };
  }
  const client = await verifiedClient();
  if (!client) return { message: 'signin', reason: parsed.reason, targetStatus: parsed.targetStatus };

  const result = await client.rpc('admin_moderate_seller_status', {
    p_seller_public_id: sellerPublicId,
    p_expected_version: expectedVersion,
    p_account_status: parsed.targetStatus,
    p_reason: parsed.reason,
  });
  if (result.error) {
    return {
      message: mapAdminSellerRpcError(result.error),
      reason: parsed.reason,
      targetStatus: parsed.targetStatus,
    };
  }
  redirect(sellerDetailRedirect(locale, sellerPublicId, parsed.targetStatus, returnTo));
}
