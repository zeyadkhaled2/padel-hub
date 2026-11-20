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
  shoeSizeEuSchema,
  strictPositiveIntSchema,
  uuidSchema,
} from '@/lib/validation/shared';
import {
  REVIEW_DISPLAY_FIELD_KEYS,
  type AdminAccess,
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
  racket_year: z.number().int().nullable(),
  racket_shape: racketShapeSchema.nullable(),
  racket_weight_grams: z.number().int().nullable(),
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
