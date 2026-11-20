import { z } from 'zod';
import { MODERATION_NOTE_MAX_LENGTH } from '@/lib/domain/equipment';
import { classifyRpcError, type RpcErrorLike } from '@/lib/errors/domain';
import {
  nonNegativeIntSchema,
  strictPositiveIntSchema,
  uuidSchema,
} from '@/lib/validation/shared';
import {
  REPORT_REASONS,
  REPORT_RESOLUTIONS,
  REPORT_TARGET_TYPES,
  type AdminReportsPage,
  type ReportMessage,
  type ReportReason,
  type ReportResolutionAction,
  type ReportTargetType,
} from './types';

const reportTargetTypeSchema = z.enum(REPORT_TARGET_TYPES);
const reportReasonSchema = z.enum(REPORT_REASONS);
const reportResolutionSchema = z.enum(REPORT_RESOLUTIONS);

const adminReportsPageSchema = z.object({
  total: nonNegativeIntSchema,
  items: z.array(
    z.object({
      id: uuidSchema,
      version: strictPositiveIntSchema,
      target_version: strictPositiveIntSchema,
      target_type: reportTargetTypeSchema,
      title: z.string().nullable(),
      username: z.string(),
      public_id: uuidSchema.optional(),
      listing_id: uuidSchema.nullable(),
      reason_code: reportReasonSchema,
      details: z
        .string()
        .nullable()
        .transform((value) => value ?? ''),
    }),
  ),
});

export type ParsedReportSubmission =
  | {
      ok: true;
      targetType: ReportTargetType;
      targetId: string;
      reason: ReportReason;
      details: string;
    }
  | {
      ok: false;
      message: 'invalid';
      reason: string;
      details: string;
    };

export function parseReportSubmission(
  type: ReportTargetType,
  target: string,
  form: FormData,
): ParsedReportSubmission {
  const details = String(form.get('details') ?? '').trim();
  const rawReason = String(form.get('reason') ?? '');
  const validType = reportTargetTypeSchema.safeParse(type);
  const validTarget = uuidSchema.safeParse(target);
  const validReason = reportReasonSchema.safeParse(rawReason);

  if (
    !validType.success ||
    !validTarget.success ||
    !validReason.success ||
    details.length > MODERATION_NOTE_MAX_LENGTH
  ) {
    return { ok: false, message: 'invalid', reason: rawReason, details };
  }

  return {
    ok: true,
    targetType: validType.data,
    targetId: validTarget.data,
    reason: validReason.data,
    details,
  };
}

export type ParsedReportResolution =
  | {
      ok: true;
      reportId: string;
      version: number;
      targetVersion: number;
      action: ReportResolutionAction;
      note: string;
    }
  | {
      ok: false;
      message: 'noteRequired';
      details: string;
    };

export function parseReportResolution(
  id: string,
  version: number,
  targetVersion: number,
  form: FormData,
): ParsedReportResolution {
  const details = String(form.get('details') ?? '').trim();
  const rawAction = String(form.get('intent') ?? '');

  const validId = uuidSchema.safeParse(id);
  const validVersion = strictPositiveIntSchema.safeParse(version);
  const validTargetVersion = strictPositiveIntSchema.safeParse(targetVersion);
  const validAction = reportResolutionSchema.safeParse(rawAction);

  if (
    !validId.success ||
    !validVersion.success ||
    !validTargetVersion.success ||
    !validAction.success ||
    !details ||
    details.length > MODERATION_NOTE_MAX_LENGTH
  ) {
    return { ok: false, message: 'noteRequired', details };
  }

  return {
    ok: true,
    reportId: validId.data,
    version: validVersion.data,
    targetVersion: validTargetVersion.data,
    action: validAction.data,
    note: details,
  };
}

export function mapReportSubmissionRpcError(error: RpcErrorLike): ReportMessage {
  switch (classifyRpcError(error)) {
    case 'conflict':
      return 'duplicate';
    case 'rate_limited':
      return 'limit';
    default:
      return 'unavailable';
  }
}

export function mapReportResolutionRpcError(error: RpcErrorLike): ReportMessage {
  return classifyRpcError(error) === 'conflict' ? 'conflict' : 'unavailable';
}

export function parseAdminReportsPage(raw: unknown): AdminReportsPage | null {
  const parsed = adminReportsPageSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
