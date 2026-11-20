import { z } from 'zod';
import {
  CATEGORY_SPECIFIC_TEXT_FIELDS,
  LISTING_FORM_INTENTS,
  LISTING_LIFECYCLE_ACTIONS,
  LISTING_TEXT_LIMITS,
  getCategoryConfig,
  type EquipmentCategory,
  type ListingFormIntent,
  type ListingLifecycleAction,
  type ListingTextFieldKey,
  type OfferType,
} from '@/lib/domain/equipment';
import { classifyRpcError, type RpcErrorLike } from '@/lib/errors/domain';
import {
  brandSlugSchema,
  equipmentCategorySchema,
  governorateSlugSchema,
  listingConditionSchema,
  listingPriceSchema,
  listingStatusSchema,
  offerTypeSchema,
  parseOptionalBoundedInt,
  parseShoeSizeEuInput,
  positiveVersionSchema,
  racketShapeSchema,
  racketWeightGramsSchema,
  racketYearSchema,
  shoeSizeEuSchema,
  strictPositiveIntSchema,
  uuidSchema,
} from '@/lib/validation/shared';
import type {
  Listing,
  ListingDraftPatch,
  ListingEditorMessage,
  ListingRejectionDecision,
  OwnerListingSummary,
  PhotoDraftSummary,
} from './types';

const listingFormIntentSchema = z.enum(LISTING_FORM_INTENTS);

const baseOwnerListingSchema = z.object({
  id: uuidSchema,
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
  price_egp: listingPriceSchema.nullable(),
  is_negotiable: z.boolean(),
  version: strictPositiveIntSchema,
  content_version: strictPositiveIntSchema,
  last_approved_content_version: strictPositiveIntSchema.nullable(),
  media_ids: z.array(uuidSchema),
});

const ownerListingSchema = z.discriminatedUnion('category', [
  baseOwnerListingSchema.extend({
    category: z.literal('rackets'),
    offer_type: offerTypeSchema.nullable(),
    swap_preference: z.string().nullable(),
    racket_damage_repair_disclosure: z.string().nullable(),
    racket_year: racketYearSchema.nullable(),
    racket_shape: racketShapeSchema.nullable(),
    racket_weight_grams: racketWeightGramsSchema.nullable(),
    racket_purchase_date: z.string().nullable(),
    shoe_size_eu: z.null(),
    balls_quantity_packaging: z.null(),
    balls_availability_note: z.null(),
  }),
  baseOwnerListingSchema.extend({
    category: z.literal('balls'),
    offer_type: z.literal('sale').nullable(),
    swap_preference: z.null(),
    racket_damage_repair_disclosure: z.null(),
    racket_year: z.null(),
    racket_shape: z.null(),
    racket_weight_grams: z.null(),
    racket_purchase_date: z.null(),
    shoe_size_eu: z.null(),
    balls_quantity_packaging: z.string().nullable(),
    balls_availability_note: z.string().nullable(),
  }),
  baseOwnerListingSchema.extend({
    category: z.literal('shoes'),
    offer_type: z.literal('sale').nullable(),
    swap_preference: z.null(),
    racket_damage_repair_disclosure: z.null(),
    racket_year: z.null(),
    racket_shape: z.null(),
    racket_weight_grams: z.null(),
    racket_purchase_date: z.null(),
    shoe_size_eu: shoeSizeEuSchema.nullable(),
    balls_quantity_packaging: z.null(),
    balls_availability_note: z.null(),
  }),
  baseOwnerListingSchema.extend({
    category: z.literal('bags'),
    offer_type: z.literal('sale').nullable(),
    swap_preference: z.null(),
    racket_damage_repair_disclosure: z.null(),
    racket_year: z.null(),
    racket_shape: z.null(),
    racket_weight_grams: z.null(),
    racket_purchase_date: z.null(),
    shoe_size_eu: z.null(),
    balls_quantity_packaging: z.null(),
    balls_availability_note: z.null(),
  }),
]);

const ownerListingSummaryListSchema = z.array(
  z.object({
    id: uuidSchema,
    category: equipmentCategorySchema,
    title: z.string().nullable(),
    status: listingStatusSchema,
  }),
);

const photoDraftSummaryListSchema = z.array(
  z.object({
    id: uuidSchema,
    category: equipmentCategorySchema,
    title: z.string().nullable(),
    version: strictPositiveIntSchema,
  }),
);

const listingRejectionDecisionSchema = z.object({
  decision: z.literal('rejected'),
  reason: z.string(),
  decided_at: z.string().nullable(),
});

export function parseCreateListingCategory(
  raw: FormDataEntryValue | null,
): EquipmentCategory | null {
  if (typeof raw !== 'string') return null;
  const parsed = equipmentCategorySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function isLifecycleAction(intent: ListingFormIntent): intent is ListingLifecycleAction {
  return (LISTING_LIFECYCLE_ACTIONS as readonly string[]).includes(intent);
}

export function parseListingActionHeader(
  values: Record<string, string>,
): { ok: true; id: string; version: number; intent: ListingFormIntent } | { ok: false } {
  const id = uuidSchema.safeParse(values.id);
  const version = positiveVersionSchema.safeParse(values.version);
  const intent = listingFormIntentSchema.safeParse(values.intent);
  if (!id.success || !version.success || !intent.success) {
    return { ok: false };
  }
  return { ok: true, id: id.data, version: version.data, intent: intent.data };
}

function parseOptionalChoice<T extends z.ZodType>(
  schema: T,
  raw: string | undefined,
): { ok: true; value: z.infer<T> | null } | { ok: false } {
  if (!raw) {
    return { ok: true, value: null };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false };
  }
  return { ok: true, value: parsed.data };
}

function parseOptionalPrice(raw: string | undefined): { ok: true; value: number | null } | { ok: false } {
  if (!raw) {
    return { ok: true, value: null };
  }
  const parsed = listingPriceSchema.safeParse(Number(raw));
  if (!parsed.success) {
    return { ok: false };
  }
  return { ok: true, value: parsed.data };
}

export function buildListingDraftPatch(
  category: EquipmentCategory,
  values: Record<string, string>,
): { ok: true; patch: ListingDraftPatch } | { ok: false; error: 'invalid' } {
  const textValues = {} as Record<ListingTextFieldKey, string | null>;
  for (const [key, limit] of Object.entries(LISTING_TEXT_LIMITS) as [ListingTextFieldKey, number][]) {
    const trimmed = (values[key] ?? '').trim();
    if (trimmed.length > limit) {
      return { ok: false, error: 'invalid' };
    }
    textValues[key] = trimmed || null;
  }

  const brand = parseOptionalChoice(brandSlugSchema, values.brand_slug);
  const governorate = parseOptionalChoice(governorateSlugSchema, values.governorate_slug);
  const condition = parseOptionalChoice(listingConditionSchema, values.condition);
  const offer = parseOptionalChoice(offerTypeSchema, values.offer_type);
  const price = parseOptionalPrice(values.price_egp);

  if (!brand.ok || !governorate.ok || !condition.ok || !offer.ok || !price.ok) {
    return { ok: false, error: 'invalid' };
  }

  const config = getCategoryConfig(category);
  const shoeSize = config.hasShoeSize
    ? parseShoeSizeEuInput(values.shoe_size_eu ?? '')
    : { ok: true as const, value: null };
  const racketYear = config.hasRacketSpecs
    ? parseOptionalBoundedInt(values.racket_year, racketYearSchema)
    : { ok: true as const, value: null };
  const racketWeight = config.hasRacketSpecs
    ? parseOptionalBoundedInt(values.racket_weight_grams, racketWeightGramsSchema)
    : { ok: true as const, value: null };
  const racketShape = config.hasRacketSpecs
    ? parseOptionalChoice(racketShapeSchema, values.racket_shape)
    : { ok: true as const, value: null };

  if (!shoeSize.ok || !racketYear.ok || !racketWeight.ok || !racketShape.ok) {
    return { ok: false, error: 'invalid' };
  }

  const allowedCategoryFields = new Set(config.extraTextFields.map((field) => field.key));
  for (const fieldKey of CATEGORY_SPECIFIC_TEXT_FIELDS) {
    if (!allowedCategoryFields.has(fieldKey)) {
      textValues[fieldKey] = null;
    }
  }

  const normalizedOfferType: OfferType | null = config.supportsSwap
    ? offer.value
    : config.defaultOfferType;

  let normalizedPrice = price.value;
  let normalizedNegotiable = values.is_negotiable === 'on';
  let normalizedSwapPreference = textValues.swap_preference;

  if (normalizedOfferType === 'sale') {
    normalizedSwapPreference = null;
  }
  if (normalizedOfferType === 'swap') {
    normalizedPrice = null;
    normalizedNegotiable = false;
  }

  return {
    ok: true,
    patch: {
      title: textValues.title,
      brand_slug: brand.value,
      brand_custom: brand.value === 'other' ? textValues.brand_custom : null,
      model: textValues.model,
      description: textValues.description,
      governorate_slug: governorate.value,
      district_text: textValues.district_text,
      condition: condition.value,
      condition_disclosure: textValues.condition_disclosure,
      offer_type: normalizedOfferType,
      price_egp: normalizedPrice,
      is_negotiable: normalizedNegotiable,
      swap_preference: normalizedSwapPreference,
      racket_damage_repair_disclosure: textValues.racket_damage_repair_disclosure,
      racket_year: racketYear.value,
      racket_weight_grams: racketWeight.value,
      racket_shape: racketShape.value,
      shoe_size_eu: shoeSize.value,
      balls_quantity_packaging: textValues.balls_quantity_packaging,
      balls_availability_note: textValues.balls_availability_note,
    },
  };
}

export function mapListingRpcError(
  error: RpcErrorLike,
  operation: 'save' | 'transition',
): ListingEditorMessage {
  const kind = classifyRpcError(error);
  if (operation === 'save') {
    return kind === 'conflict' ? 'conflict' : 'invalid';
  }
  if (kind === 'conflict') return 'conflictOrLimit';
  if (kind === 'requirements_unmet') return 'requirements';
  return 'unavailable';
}

export function parseOwnerListing(raw: unknown): Listing | null {
  const parsed = ownerListingSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parseOwnerListingSummaries(raw: unknown): OwnerListingSummary[] | null {
  const parsed = ownerListingSummaryListSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parsePhotoDraftSummaries(raw: unknown): PhotoDraftSummary[] | null {
  const parsed = photoDraftSummaryListSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parseListingDecision(raw: unknown): ListingRejectionDecision | null {
  if (raw === null || raw === undefined) return null;
  const parsed = listingRejectionDecisionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
