'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { verifiedClient } from '@/server/supabase/server';
import { localeValue } from '@/features/auth/types';

export type MfaState = { message?: string; factor?: string; secret?: string };
export type ReviewSnapshot = { listing: Record<string, unknown> & { id: string; version: number; content_version: number; status: string }; profile: Record<string, unknown> & { version: number }; media_manifest: { media_id: string }[] };

export async function verifyAdmin(locale: string, previous: MfaState, form: FormData): Promise<MfaState> {
  const client = await verifiedClient();
  if (!client) return { message: 'signin' };
  const access = await client.rpc('get_my_admin_access');
  if (access.error || !access.data?.is_admin) return { message: 'denied' };
  if (access.data.mfa_verified) redirect(`/${localeValue(locale)}/admin`);
  const factors = await client.auth.mfa.listFactors();
  if (factors.error) return { message: 'unavailable' };
  if (form.get('intent') === 'enroll') {
    if (factors.data.totp.length) return { message: 'alreadyEnrolled' };
    for (const factor of factors.data.all.filter(f => f.factor_type === 'totp' && f.status === 'unverified')) {
      const removal = await client.auth.mfa.unenroll({ factorId: factor.id });
      if (removal.error) return { message: 'unavailable' };
    }
    const result = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'PadelHub admin' });
    if (result.error) return { message: 'unavailable' };
    return { factor: result.data.id, secret: result.data.totp.secret };
  }
  const factorId = String(form.get('factor') ?? '');
  const code = String(form.get('code') ?? '').trim();
  if (!/^\d{6}$/.test(code) || !factors.data.all.some(f => f.id === factorId && f.factor_type === 'totp')) return { ...previous, message: 'invalidCode' };
  const result = await client.auth.mfa.challengeAndVerify({ factorId, code });
  if (result.error) return { ...previous, message: 'invalidCode' };
  redirect(`/${localeValue(locale)}/admin`);
}

export async function decideListing(locale: string, snapshot: ReviewSnapshot, _previous: {message?: string; reason?: string}, form: FormData): Promise<{message?: string; reason?: string}> {
  const client = await verifiedClient();
  if (!client) return { message: 'signin' };
  const intent = form.get('intent');
  const reason = String(form.get('reason') ?? '').trim();
  if (!z.uuid().safeParse(snapshot.listing.id).success || !['approve','reject'].includes(String(intent)) || reason.length>1000 || (intent==='reject' && !reason)) return { message: 'reasonRequired', reason };
  const args = { p_listing_id: snapshot.listing.id, p_expected_listing_version: snapshot.listing.version,
    p_expected_content_version: snapshot.listing.content_version, p_expected_profile_version: snapshot.profile.version, p_reviewed_manifest: snapshot.media_manifest };
  const result = intent === 'approve' ? await client.rpc('admin_approve_listing', args) : await client.rpc('admin_reject_listing', { ...args, p_reason: reason });
  if (result.error) return { message: result.error.code === 'PT409' ? 'conflict' : result.error.code === '42501' ? 'denied' : 'decisionFailed', reason };
  redirect(`/${localeValue(locale)}/admin?done=${intent}`);
}
