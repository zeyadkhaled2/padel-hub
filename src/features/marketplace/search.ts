import { z } from 'zod';
import {
  LISTING_PRICE_BOUNDS,
  MAX_SEARCH_QUERY_LENGTH,
  SEARCH_SORT_OPTIONS,
  getCategoryConfig,
  type EquipmentCategory,
} from '@/lib/domain/equipment';
import {
  accountTypeSchema,
  brandSlugSchema,
  equipmentCategorySchema,
  governorateSlugSchema,
  listingConditionSchema,
  listingPriceSchema,
  nonNegativeIntSchema,
  offerTypeSchema,
  parsePageParam,
  parseShoeSizeEuInput,
  publicListingStatusSchema,
  racketShapeSchema,
  shoeSizeEuSchema,
  uuidSchema,
  whatsappE164Schema,
} from '@/lib/validation/shared';
import type {
  ListingContact,
  MarketplaceSearchValues,
  ParsedMarketplaceSearch,
  PublicDetailFieldKey,
  PublicListing,
  Query,
} from './types';

const searchCategorySchema = z.union([z.literal(''), equipmentCategorySchema]);
const searchConditionSchema = z.union([z.literal(''), listingConditionSchema]);
const searchOfferSchema = z.union([z.literal(''), offerTypeSchema]);
const searchSortSchema = z.enum(SEARCH_SORT_OPTIONS);

const publicSellerSchema = z.object({
  display_name: z.string(),
  username: z.string(),
  account_type: accountTypeSchema,
});

const basePublicListingSchema = z.object({
  id: uuidSchema,
  title: z.string(),
  status: publicListingStatusSchema,
  brand_slug: brandSlugSchema,
  brand_custom: z.string().nullable(),
  model: z.string(),
  description: z.string(),
  governorate_slug: governorateSlugSchema,
  district_text: z.string().nullable(),
  condition: listingConditionSchema,
  condition_disclosure: z.string(),
  price_egp: listingPriceSchema.nullable(),
  is_negotiable: z.boolean(),
  last_confirmed_available_at: z.string().nullable(),
  published_at: z.string().nullable().optional(),
  media_ids: z.array(uuidSchema),
  seller: publicSellerSchema,
});

export const publicListingSchema = z.discriminatedUnion('category', [
  basePublicListingSchema.extend({
    category: z.literal('rackets'),
    offer_type: offerTypeSchema,
    swap_preference: z.string().nullable(),
    racket_damage_repair_disclosure: z.string(),
    racket_year: z.number().int().nullable(),
    racket_shape: racketShapeSchema.nullable(),
    racket_weight_grams: z.number().int().nullable(),
    racket_purchase_date: z.string().nullable(),
    shoe_size_eu: z.null(),
    balls_quantity_packaging: z.null(),
    balls_availability_note: z.null(),
  }),
  basePublicListingSchema.extend({
    category: z.literal('balls'),
    offer_type: z.literal('sale'),
    price_egp: listingPriceSchema,
    swap_preference: z.null(),
    racket_damage_repair_disclosure: z.null(),
    racket_year: z.null(),
    racket_shape: z.null(),
    racket_weight_grams: z.null(),
    racket_purchase_date: z.null(),
    shoe_size_eu: z.null(),
    balls_quantity_packaging: z.string(),
    balls_availability_note: z.string().nullable(),
  }),
  basePublicListingSchema.extend({
    category: z.literal('shoes'),
    offer_type: z.literal('sale'),
    price_egp: listingPriceSchema,
    swap_preference: z.null(),
    racket_damage_repair_disclosure: z.null(),
    racket_year: z.null(),
    racket_shape: z.null(),
    racket_weight_grams: z.null(),
    racket_purchase_date: z.null(),
    shoe_size_eu: shoeSizeEuSchema,
    balls_quantity_packaging: z.null(),
    balls_availability_note: z.null(),
  }),
  basePublicListingSchema.extend({
    category: z.literal('bags'),
    offer_type: z.literal('sale'),
    price_egp: listingPriceSchema,
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

const publicSearchResponseSchema = z.object({
  total: nonNegativeIntSchema,
  items: z.array(publicListingSchema),
});

const listingContactSchema = z.object({
  title: z.string(),
  phone: whatsappE164Schema,
});

function readParam(value: Query[string]): string {
  return typeof value === 'string' ? value : '';
}

export function extractSearchValues(query: Query): MarketplaceSearchValues {
  return {
    q: readParam(query.q),
    category: readParam(query.category),
    governorate: readParam(query.governorate),
    brand: readParam(query.brand),
    condition: readParam(query.condition),
    offer: readParam(query.offer),
    min: readParam(query.min),
    max: readParam(query.max),
    sort: readParam(query.sort),
    page: readParam(query.page),
    size: readParam(query.size),
  };
}

function parseOptionalPriceFilter(
  raw: string,
): { ok: true; value: number | null } | { ok: false } {
  if (raw === '') return { ok: true, value: null };
  if (!/^\d{1,6}$/.test(raw)) return { ok: false };
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < LISTING_PRICE_BOUNDS.searchMin) {
    return { ok: false };
  }
  return { ok: true, value };
}

export function parseMarketplaceSearch(
  values: MarketplaceSearchValues,
): { ok: true; params: ParsedMarketplaceSearch } | { ok: false } {
  if (values.q.length > MAX_SEARCH_QUERY_LENGTH) return { ok: false };

  const category = searchCategorySchema.safeParse(values.category);
  const condition = searchConditionSchema.safeParse(values.condition);
  const offer = searchOfferSchema.safeParse(values.offer);
  const sort = searchSortSchema.safeParse(values.sort);
  const page = parsePageParam(values.page);
  const min = parseOptionalPriceFilter(values.min);
  const max = parseOptionalPriceFilter(values.max);
  const shoeSize = parseShoeSizeEuInput(values.size, { strictFormat: true });

  if (
    !category.success ||
    !condition.success ||
    !offer.success ||
    !sort.success ||
    !page.ok ||
    !min.ok ||
    !max.ok ||
    !shoeSize.ok
  ) {
    return { ok: false };
  }

  if (max.value !== null && max.value > LISTING_PRICE_BOUNDS.max) {
    return { ok: false };
  }
  if (min.value !== null && max.value !== null && max.value < min.value) {
    return { ok: false };
  }

  return {
    ok: true,
    params: {
      q: values.q,
      category: category.data,
      governorate: values.governorate,
      brand: values.brand,
      condition: condition.data,
      offer: offer.data,
      min: min.value,
      max: max.value,
      sort: sort.data,
      page: page.page,
      shoeSize: shoeSize.value,
    },
  };
}

export function buildCategoryPillQuery(
  item: '' | EquipmentCategory,
  query: string,
  sort: string,
  values: Partial<MarketplaceSearchValues> = {},
): Record<string, string | undefined> {
  const keepShoeSize = item === '' || getCategoryConfig(item).supportsShoeSizeFilter;
  return {
    ...values,
    page: undefined,
    category: undefined,
    size: keepShoeSize ? values.size : undefined,
    ...(query ? { q: query } : {}),
    ...(sort ? { sort } : {}),
    ...(item ? { category: item } : {}),
  };
}

export function buildWhatsAppDestination(phone: string, text: string): string | null {
  const validPhone = whatsappE164Schema.safeParse(phone);
  if (!validPhone.success) return null;
  const destination = new URL(`https://wa.me/${validPhone.data.slice(1)}`);
  destination.searchParams.set('text', text);
  return destination.href;
}

export function parsePublicListing(raw: unknown): PublicListing | null {
  const parsed = publicListingSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parsePublicSearchResponse(
  raw: unknown,
): { items: PublicListing[]; total: number } | null {
  const parsed = publicSearchResponseSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parseListingContact(raw: unknown): ListingContact | null {
  const parsed = listingContactSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function getPublicListingDetailSections(
  listing: PublicListing,
): { key: PublicDetailFieldKey; value: string | number }[] {
  const entries: { key: PublicDetailFieldKey; value: string | number | null }[] = [
    { key: 'shoe_size_eu', value: listing.shoe_size_eu },
    { key: 'model', value: listing.model },
    { key: 'description', value: listing.description },
    { key: 'condition_disclosure', value: listing.condition_disclosure },
    { key: 'racket_damage_repair_disclosure', value: listing.racket_damage_repair_disclosure },
    { key: 'swap_preference', value: listing.swap_preference },
    { key: 'balls_quantity_packaging', value: listing.balls_quantity_packaging },
    { key: 'balls_availability_note', value: listing.balls_availability_note },
  ];
  return entries.filter(
    (entry): entry is { key: PublicDetailFieldKey; value: string | number } =>
      entry.value !== null && entry.value !== '',
  );
}
