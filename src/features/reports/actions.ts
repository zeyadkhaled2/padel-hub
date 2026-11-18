'use server';
import { verifiedClient } from '@/server/supabase/server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { localeValue } from '@/features/auth/types';

export type ReportState = { message?: string; details?: string; reason?: string };
export async function submitReport(type: string, target: string, _state: ReportState, form: FormData): Promise<ReportState> {
  const details = String(form.get('details') ?? '').trim();
  const reason = String(form.get('reason') ?? '');
  const client = await verifiedClient();
  if (!client) return { message: 'signin', details, reason };
  if (!z.uuid().safeParse(target).success || !['listing','profile'].includes(type) || !['misleading','prohibited','spam','abuse','other'].includes(reason) || details.length>1000) return { message:'invalid',details,reason };
  const result = await client.rpc('report_content',{p_type:type,p_target:target,p_reason:reason,p_details:details});
  return {message: result.error ? result.error.code==='PT409'?'duplicate':result.error.code==='PT429'?'limit':'unavailable' : 'submitted', details, reason};
}
export async function resolveReport(locale: string, id: string, version: number, targetVersion: number, _state: ReportState, form: FormData): Promise<ReportState> {
  const client = await verifiedClient();
  if (!client) return {message:'signin'};
  const details=String(form.get('details')??'').trim(), action=String(form.get('intent')??'');
  if (!z.uuid().safeParse(id).success || !['dismiss','remove','suspend'].includes(action) || !details || details.length>1000) return {message:'noteRequired',details};
  const result=await client.rpc('resolve_report',{p_report:id,p_expected_version:version,p_expected_target_version:targetVersion,p_action:action,p_note:details});
  if(result.error) return {message:result.error.code==='PT409'?'conflict':'unavailable',details};
  redirect(`/${localeValue(locale)}/admin/reports?done=1`);
}
