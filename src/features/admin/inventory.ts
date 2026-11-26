import { z } from 'zod';
import { MAX_PAGE, MAX_SEARCH_QUERY_LENGTH, PAGE_SIZE } from '@/lib/domain/equipment';
import { accountTypeSchema, equipmentCategorySchema, governorateSlugSchema, listingStatusSchema, offerTypeSchema, uuidSchema } from '@/lib/validation/shared';

export const INVENTORY_SORTS = ['created', 'updated', 'pending'] as const;
export type InventoryParams = Record<string, string | string[] | undefined>;
const querySchema = z.object({
  q: z.string().trim().max(MAX_SEARCH_QUERY_LENGTH).default(''),
  status: z.union([z.literal(''), listingStatusSchema]).default(''),
  category: z.union([z.literal(''), equipmentCategorySchema]).default(''),
  account: z.union([z.literal(''), accountTypeSchema]).default(''),
  governorate: z.union([z.literal(''), governorateSlugSchema]).default(''),
  sort: z.enum(INVENTORY_SORTS).default('created'),
  page: z.string().regex(/^[1-9]\d*$/).default('1').transform(Number).pipe(z.number().int().max(MAX_PAGE)),
});
export type InventoryQuery = z.infer<typeof querySchema>;
export function parseInventoryQuery(params: InventoryParams) {
  return querySchema.safeParse(params);
}
export function inventoryHref(query: InventoryQuery, page = query.page) {
  const params = new URLSearchParams();
  for (const key of ['q', 'status', 'category', 'account', 'governorate', 'sort'] as const) {
    if (query[key]) params.set(key, query[key]);
  }
  if (page > 1) params.set('page', String(page));
  return `/admin/listings?${params}`;
}
export function inventoryReturnHref(raw: unknown) {
  if (typeof raw !== 'string' || raw.length > 1500 || !raw.startsWith('/admin/listings?')) return '/admin/listings';
  const params = new URLSearchParams(raw.slice('/admin/listings?'.length));
  if ([...params.keys()].some(key => params.getAll(key).length !== 1)) return '/admin/listings';
  const parsed = parseInventoryQuery(Object.fromEntries(params));
  return parsed.success ? inventoryHref(parsed.data) : '/admin/listings';
}

const count = z.number().int().nonnegative();
export const inventoryPageSchema = z.object({
  total: count,
  counts: z.partialRecord(listingStatusSchema, count).nullable(),
  items: z.array(z.object({
    id: uuidSchema, title: z.string().nullable(), category: equipmentCategorySchema,
    status: listingStatusSchema, offer_type: offerTypeSchema.nullable(), price_egp: z.number().nullable(),
    swap_preference: z.string().nullable(), display_name: z.string().nullable(), username: z.string().nullable(),
    created_at: z.string(), updated_at: z.string(), submitted_at: z.string().nullable(),
    public_visible: z.boolean(), cover_media_id: uuidSchema.nullable(),
  })).max(PAGE_SIZE),
});
export const inspectionSchema = z.object({
  created_at: z.string(), updated_at: z.string(), approved_at: z.string().nullable(), published_at: z.string().nullable(),
  public_visible: z.boolean(),
  decision: z.object({ action: z.enum(['listing.approved', 'listing.rejected', 'listing.removed', 'report.remove']), reason: z.string().nullable(), created_at: z.string() }).nullable(),
});
