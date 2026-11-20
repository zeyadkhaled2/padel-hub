'use server';

import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { localeValue } from '@/features/auth/types';
import { verifiedClient } from '@/server/supabase/server';
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
    friendlyName: 'PadelHub admin',
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

  redirect(`/${localeValue(locale)}/admin?done=${parsed.intent}`);
}
