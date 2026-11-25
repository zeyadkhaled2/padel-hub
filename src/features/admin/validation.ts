import { z } from 'zod';
import { MODERATION_NOTE_MAX_LENGTH } from '@/lib/domain/equipment';
import { classifyRpcError, type RpcErrorLike } from '@/lib/errors/domain';
import { photoManifestSchema } from '@/features/photos/validation';
import {
  accountStatusSchema,
  accountTypeSchema,
  brandSlugSchema,
  equipmentCategorySchema,
  governorateSlugSchema,
  listingConditionSchema,
  listingPriceSchema,
  listingStatusSchema,
  nonNegativeIntSchema,
  offerTypeSchema,
  racketShapeSchema,
  racketWeightGramsSchema,
  racketYearSchema,
  shoeSizeEuSchema,
  strictPositiveIntSchema,
  uuidSchema,
} from '@/lib/validation/shared';
import {
  REVIEW_DISPLAY_FIELD_KEYS,
  type AdminAccess,
  type AdminDailyEngagementPoint,
  type AdminDashboardOverview,
  type PendingListingsPage,
  type ReviewDecisionIntent,
  type ReviewDecisionMessage,
  type ReviewDisplayFieldKey,
  type ReviewListing,
  type ReviewMediaItem,
  type ReviewSnapshot,
} from './types';

const adminAccessSchema = z.object({
  is_admin: z.boolean(),
  mfa_verified: z.boolean(),
});

const pendingListingsPageSchema = z.object({
  total: nonNegativeIntSchema,
  items: z.array(
    z.object({
      id: uuidSchema,
      title: z.string().nullable(),
      category: equipmentCategorySchema,
      submitted_at: z.string().nullable(),
      display_name: z.string(),
    }),
  ),
});

const reviewListingSchema = z.object({
  id: uuidSchema,
  seller_id: uuidSchema,
  category: equipmentCategorySchema,
  status: listingStatusSchema,
  title: z.string().nullable(),
  brand_slug: brandSlugSchema.nullable(),
  brand_custom: z.string().nullable(),
  model: z.string().nullable(),
  description: z.string().nullable(),
  governorate_slug: governorateSlugSchema.nullable(),
  district_text: z.string().nullable(),
  condition: listingConditionSchema.nullable(),
  condition_disclosure: z.string().nullable(),
  offer_type: offerTypeSchema.nullable(),
  price_egp: listingPriceSchema.nullable(),
  is_negotiable: z.boolean(),
  swap_preference: z.string().nullable(),
  racket_damage_repair_disclosure: z.string().nullable(),
  racket_year: racketYearSchema.nullable(),
  racket_shape: racketShapeSchema.nullable(),
  racket_weight_grams: racketWeightGramsSchema.nullable(),
  racket_purchase_date: z.string().nullable(),
  shoe_size_eu: shoeSizeEuSchema.nullable(),
  balls_quantity_packaging: z.string().nullable(),
  balls_availability_note: z.string().nullable(),
  version: strictPositiveIntSchema,
  content_version: strictPositiveIntSchema,
  last_approved_content_version: strictPositiveIntSchema.nullable(),
  submitted_at: z.string().nullable(),
});

const reviewProfileSchema = z.object({
  user_id: uuidSchema,
  version: strictPositiveIntSchema,
  username: z.string(),
  display_name: z.string(),
  account_type: accountTypeSchema,
  account_status: accountStatusSchema,
  is_public: z.boolean(),
  public_contact_consent: z.boolean(),
  has_contact: z.boolean(),
});

const reviewMediaItemSchema = z.object({
  media_id: uuidSchema,
  sort_order: nonNegativeIntSchema,
  ready_attempt_id: uuidSchema,
  content_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  variants: photoManifestSchema,
});

const reviewSnapshotSchema = z.object({
  listing: reviewListingSchema,
  profile: reviewProfileSchema,
  media_manifest: z.array(reviewMediaItemSchema),
});

const totpCodeSchema = z.string().regex(/^\d{6}$/);
const reviewDecisionIntentSchema = z.enum(['approve', 'reject']);
const coercedCountSchema = z.coerce.number().pipe(nonNegativeIntSchema);
const utcDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const adminTrendPeriodSchema = z.object({
  views: coercedCountSchema,
  contacts: coercedCountSchema,
  new_sellers: coercedCountSchema,
  new_listings: coercedCountSchema,
  submitted_listings: coercedCountSchema,
  new_reports: coercedCountSchema,
});

const adminDailyEngagementPointSchema = z.object({
  day: utcDateSchema,
  views: coercedCountSchema,
  contacts: coercedCountSchema,
});

const adminActivityItemSchema = z.object({
  id: z.coerce.number().int().positive(),
  actor_role: z.enum(['admin', 'moderator', 'owner']),
  action: z.string().min(1).max(80),
  target_type: z.enum(['listing', 'profile']),
  target_id: z.string().min(1).max(80),
  target_label: z.string().max(160).nullable(),
  target_status: z.string().max(40).nullable(),
  reason: z.string().max(MODERATION_NOTE_MAX_LENGTH).nullable(),
  created_at: z.string().min(1),
});

const adminDashboardOverviewSchema = z.object({
  generated_at: z.string().min(1),
  window_end_utc: utcDateSchema,
  kpis: z.object({
    sellers_total: coercedCountSchema,
    sellers_active: coercedCountSchema,
    sellers_suspended: coercedCountSchema,
    sellers_hidden: coercedCountSchema,
    listings_total: coercedCountSchema,
    listings_active: coercedCountSchema,
    listings_pending: coercedCountSchema,
    listings_rejected: coercedCountSchema,
    listings_draft: coercedCountSchema,
    listings_sold: coercedCountSchema,
    listings_traded: coercedCountSchema,
    listings_archived: coercedCountSchema,
    listings_removed: coercedCountSchema,
    open_reports: coercedCountSchema,
    views_30d: coercedCountSchema,
    contacts_30d: coercedCountSchema,
    views_7d: coercedCountSchema,
    contacts_7d: coercedCountSchema,
  }),
  needs_attention: z.object({
    pending_listings: coercedCountSchema,
    oldest_pending_submitted_at: z.string().nullable(),
    open_reports: coercedCountSchema,
    oldest_open_report_at: z.string().nullable(),
    suspended_sellers: coercedCountSchema,
  }),
  trends: z.object({
    period_7d: adminTrendPeriodSchema,
    period_30d: adminTrendPeriodSchema,
    daily_engagement: z.array(adminDailyEngagementPointSchema).max(30),
  }),
  recent_activity: z.array(adminActivityItemSchema).max(12),
});

const KNOWN_ACTIVITY_ACTIONS = {
  'listing.create': 'listingCreated',
  'listing.edit': 'listingUpdated',
  'listing.submit': 'listingSubmitted',
  'listing.withdraw': 'listingWithdrawn',
  'listing.approved': 'listingApproved',
  'listing.rejected': 'listingRejected',
  'listing.sold': 'listingSold',
  'listing.traded': 'listingTraded',
  'listing.archive': 'listingArchived',
  'listing.relist': 'listingRelisted',
  'listing.reopen': 'listingReopened',
  'listing.photo_detach': 'listingPhotoDetached',
  'report.dismiss': 'reportDismissed',
  'report.remove': 'reportRemoved',
  'report.suspend': 'reportSuspended',
} as const;

export type AdminActivityActionKey =
  | (typeof KNOWN_ACTIVITY_ACTIONS)[keyof typeof KNOWN_ACTIVITY_ACTIONS]
  | 'other';

export function parseAdminDashboardOverview(raw: unknown): AdminDashboardOverview | null {
  const parsed = adminDashboardOverviewSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function getActivityActionTranslationKey(action: string): AdminActivityActionKey {
  if (action in KNOWN_ACTIVITY_ACTIONS) {
    return KNOWN_ACTIVITY_ACTIONS[action as keyof typeof KNOWN_ACTIVITY_ACTIONS];
  }
  return 'other';
}

export function buildRecentEngagementSeries(
  daily: readonly AdminDailyEngagementPoint[],
  windowEndUtc: string,
  days: 7 | 30 = 7,
): {
  points: AdminDailyEngagementPoint[];
  maxViews: number;
  maxContacts: number;
  hasActivity: boolean;
} {
  const endDate = new Date(`${windowEndUtc}T00:00:00Z`);
  if (Number.isNaN(endDate.getTime())) {
    return { points: [], maxViews: 0, maxContacts: 0, hasActivity: false };
  }

  const byDay = new Map<string, AdminDailyEngagementPoint>();
  for (const row of daily) {
    byDay.set(row.day, row);
  }

  const points: AdminDailyEngagementPoint[] = [];
  let maxViews = 0;
  let maxContacts = 0;
  let hasActivity = false;

  for (let offset = days - 1; offset >= 0; offset--) {
    const cursor = new Date(endDate.getTime() - offset * 86_400_000);
    const isoDay = cursor.toISOString().slice(0, 10);
    const existing = byDay.get(isoDay);
    const views = existing?.views ?? 0;
    const contacts = existing?.contacts ?? 0;
    if (views > 0 || contacts > 0) hasActivity = true;
    if (views > maxViews) maxViews = views;
    if (contacts > maxContacts) maxContacts = contacts;
    points.push({ day: isoDay, views, contacts });
  }

  return { points, maxViews, maxContacts, hasActivity };
}

export function parseAdminAccess(raw: unknown): AdminAccess | null {
  const parsed = adminAccessSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parsePendingListingsPage(raw: unknown): PendingListingsPage | null {
  const parsed = pendingListingsPageSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parseReviewSnapshot(raw: unknown): ReviewSnapshot | null {
  const parsed = reviewSnapshotSchema.safeParse(raw);
  if (!parsed.success) return null;
  // Preserve exact raw media_manifest objects for Postgres JSONB equality checks on decision submit.
  const rawManifest = (raw as { media_manifest: ReviewMediaItem[] }).media_manifest;
  return {
    listing: parsed.data.listing,
    profile: parsed.data.profile,
    media_manifest: rawManifest,
  };
}

export function parseTotpVerification(
  factorId: string,
  code: string,
  allowedTotpFactorIds: readonly string[],
): { ok: true; factorId: string; code: string } | { ok: false } {
  const trimmedCode = code.trim();
  if (!totpCodeSchema.safeParse(trimmedCode).success || !allowedTotpFactorIds.includes(factorId)) {
    return { ok: false };
  }
  return { ok: true, factorId, code: trimmedCode };
}

export type ParsedReviewDecision =
  | { ok: true; intent: ReviewDecisionIntent; reason: string }
  | { ok: false; message: 'reasonRequired'; reason: string };

export function parseReviewDecision(
  snapshot: ReviewSnapshot,
  form: FormData,
): ParsedReviewDecision {
  const intentResult = reviewDecisionIntentSchema.safeParse(form.get('intent'));
  const reason = String(form.get('reason') ?? '').trim();

  if (
    !uuidSchema.safeParse(snapshot.listing.id).success ||
    !intentResult.success ||
    reason.length > MODERATION_NOTE_MAX_LENGTH ||
    (intentResult.data === 'reject' && !reason)
  ) {
    return { ok: false, message: 'reasonRequired', reason };
  }

  return { ok: true, intent: intentResult.data, reason };
}

export function mapAdminDecisionRpcError(error: RpcErrorLike): ReviewDecisionMessage {
  switch (classifyRpcError(error)) {
    case 'conflict':
      return 'conflict';
    case 'forbidden':
      return 'denied';
    default:
      return 'decisionFailed';
  }
}

export function getReviewListingDisplayRows(
  listing: ReviewListing,
): { key: ReviewDisplayFieldKey; value: string | number | boolean }[] {
  const rows: { key: ReviewDisplayFieldKey; value: string | number | boolean }[] = [];
  for (const key of REVIEW_DISPLAY_FIELD_KEYS) {
    const value = listing[key];
    if (value !== null && value !== undefined) {
      rows.push({ key, value });
    }
  }
  return rows;
}
