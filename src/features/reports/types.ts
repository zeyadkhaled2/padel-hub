export const REPORT_TARGET_TYPES = ['listing', 'profile'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_REASONS = ['misleading', 'prohibited', 'spam', 'abuse', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_RESOLUTIONS = ['dismiss', 'remove', 'suspend'] as const;
export type ReportResolutionAction = (typeof REPORT_RESOLUTIONS)[number];

export type ReportMessage =
  | 'signin'
  | 'invalid'
  | 'submitted'
  | 'duplicate'
  | 'limit'
  | 'unavailable'
  | 'noteRequired'
  | 'conflict';

export type ReportState = {
  message?: ReportMessage;
  details?: string;
  reason?: string;
};

export type AdminReportItem = {
  id: string;
  version: number;
  target_version: number;
  target_type: ReportTargetType;
  title: string | null;
  username: string;
  public_id?: string;
  listing_id: string | null;
  reason_code: ReportReason;
  details: string;
};

export type AdminReportsPage = {
  total: number;
  items: AdminReportItem[];
};
