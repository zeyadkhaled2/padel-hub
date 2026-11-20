'use server';

import { redirect } from 'next/navigation';
import { localeValue } from '@/features/auth/types';
import { verifiedClient } from '@/server/supabase/server';
import type { ReportState, ReportTargetType } from './types';
import {
  mapReportResolutionRpcError,
  mapReportSubmissionRpcError,
  parseReportResolution,
  parseReportSubmission,
} from './validation';

export type { ReportState } from './types';

export async function submitReport(
  type: ReportTargetType,
  target: string,
  _state: ReportState,
  form: FormData,
): Promise<ReportState> {
  const details = String(form.get('details') ?? '').trim();
  const reason = String(form.get('reason') ?? '');

  const client = await verifiedClient();
  if (!client) return { message: 'signin', details, reason };

  const parsed = parseReportSubmission(type, target, form);
  if (!parsed.ok) {
    return { message: parsed.message, details: parsed.details, reason: parsed.reason };
  }

  const result = await client.rpc('report_content', {
    p_type: parsed.targetType,
    p_target: parsed.targetId,
    p_reason: parsed.reason,
    p_details: parsed.details,
  });

  return {
    message: result.error ? mapReportSubmissionRpcError(result.error) : 'submitted',
    details: parsed.details,
    reason: parsed.reason,
  };
}

export async function resolveReport(
  locale: string,
  id: string,
  version: number,
  targetVersion: number,
  _state: ReportState,
  form: FormData,
): Promise<ReportState> {
  const client = await verifiedClient();
  if (!client) return { message: 'signin' };

  const parsed = parseReportResolution(id, version, targetVersion, form);
  if (!parsed.ok) {
    return { message: parsed.message, details: parsed.details };
  }

  const result = await client.rpc('resolve_report', {
    p_report: parsed.reportId,
    p_expected_version: parsed.version,
    p_expected_target_version: parsed.targetVersion,
    p_action: parsed.action,
    p_note: parsed.note,
  });

  if (result.error) {
    return {
      message: mapReportResolutionRpcError(result.error),
      details: parsed.note,
    };
  }

  redirect(`/${localeValue(locale)}/admin/reports?done=1`);
}
