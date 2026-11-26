import { z } from 'zod';
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  MAX_PAGE,
  MAX_SEARCH_QUERY_LENGTH,
  MODERATION_NOTE_MAX_LENGTH,
  PAGE_SIZE,
} from '@/lib/domain/equipment';
import { classifyRpcError, type RpcErrorLike } from '@/lib/errors/domain';
import {
  accountStatusSchema,
  accountTypeSchema,
  governorateSlugSchema,
  nonNegativeIntSchema,
  strictPositiveIntSchema,
  uuidSchema,
} from '@/lib/validation/shared';

export const SELLER_VISIBILITIES = ['public', 'private'] as const;
export type SellerVisibilityFilter = (typeof SELLER_VISIBILITIES)[number];

export const SELLER_SORTS = ['newest', 'updated', 'activity'] as const;
export type SellerSortOption = (typeof SELLER_SORTS)[number];

export const SELLER_MODERATION_TARGETS = ['hidden', 'suspended'] as const;
export type SellerModerationTarget = (typeof SELLER_MODERATION_TARGETS)[number];

export const SELLER_LIMIT_OVERRIDE_MIN = 0;
export const SELLER_LIMIT_OVERRIDE_MAX = 500;

export type SellerQueryParams = Record<string, string | string[] | undefined>;

const sellersQuerySchema = z.object({
  q: z.string().trim().max(MAX_SEARCH_QUERY_LENGTH).default(''),
  account: z.union([z.literal(''), accountTypeSchema]).default(''),
  status: z.union([z.literal(''), accountStatusSchema]).default(''),
  governorate: z.union([z.literal(''), governorateSlugSchema]).default(''),
  visibility: z.union([z.literal(''), z.enum(SELLER_VISIBILITIES)]).default(''),
  sort: z.enum(SELLER_SORTS).default('newest'),
  page: z
    .string()
    .regex(/^[1-9]\d*$/)
    .default('1')
    .transform(Number)
    .pipe(z.number().int().max(MAX_PAGE)),
});

export type SellersQuery = z.infer<typeof sellersQuerySchema>;

export function parseSellersQuery(params: SellerQueryParams) {
  return sellersQuerySchema.safeParse(params);
}

export function sellersHref(query: SellersQuery, page = query.page): string {
  const params = new URLSearchParams();
  for (const key of ['q', 'account', 'status', 'governorate', 'visibility'] as const) {
    if (query[key]) params.set(key, query[key]);
  }
  if (query.sort && query.sort !== 'newest') params.set('sort', query.sort);
  if (page > 1) params.set('page', String(page));
  const serialized = params.toString();
  return serialized ? `/admin/sellers?${serialized}` : '/admin/sellers';
}

export function sellersReturnHref(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 1500) return '/admin/sellers';
  if (raw === '/admin/sellers') return '/admin/sellers';
  if (!raw.startsWith('/admin/sellers?')) return '/admin/sellers';
  const params = new URLSearchParams(raw.slice('/admin/sellers?'.length));
  if ([...params.keys()].some((key) => params.getAll(key).length !== 1)) {
    return '/admin/sellers';
  }
  const parsed = parseSellersQuery(Object.fromEntries(params));
  return parsed.success ? sellersHref(parsed.data) : '/admin/sellers';
}

const coercedCount = z.coerce.number().pipe(nonNegativeIntSchema);
const utcDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const sellerInventoryItemSchema = z.object({
  public_id: uuidSchema,
  display_name: z.string(),
  username: z.string(),
  account_type: accountTypeSchema,
  governorate_slug: governorateSlugSchema,
  account_status: accountStatusSchema,
  is_public: z.boolean(),
  public_profile_visible: z.boolean(),
  active_listings: coercedCount,
  pending_listings: coercedCount,
  total_listings: coercedCount,
  default_listing_limit: coercedCount,
  listing_limit_override: z.number().int().min(SELLER_LIMIT_OVERRIDE_MIN).max(SELLER_LIMIT_OVERRIDE_MAX).nullable(),
  effective_listing_limit: coercedCount,
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export type SellerInventoryItem = z.infer<typeof sellerInventoryItemSchema>;

export const sellerInventoryPageSchema = z.object({
  total: coercedCount,
  defaults: z.object({
    individual: strictPositiveIntSchema,
    business: strictPositiveIntSchema,
  }),
  counts: z.object({
    total: coercedCount,
    individual: coercedCount,
    business: coercedCount,
    active: coercedCount,
    suspended: coercedCount,
    hidden: coercedCount,
  }),
  items: z.array(sellerInventoryItemSchema).max(PAGE_SIZE),
});

export type SellerInventoryPage = z.infer<typeof sellerInventoryPageSchema>;

const sellerActivityItemSchema = z.object({
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

export const sellerDetailSchema = z.object({
  profile: z.object({
    public_id: uuidSchema,
    username: z.string(),
    display_name: z.string(),
    account_type: accountTypeSchema,
    account_status: accountStatusSchema,
    governorate_slug: governorateSlugSchema,
    district_text: z.string().nullable(),
    bio: z.string().nullable(),
    favorite_racket: z.string().nullable(),
    is_public: z.boolean(),
    public_profile_visible: z.boolean(),
    public_contact_consent: z.boolean(),
    public_contact_consented_at: z.string().nullable(),
    has_contact: z.boolean(),
    version: strictPositiveIntSchema,
    created_at: z.string().min(1),
    updated_at: z.string().min(1),
  }),
  allowance: z.object({
    individual_default: strictPositiveIntSchema,
    business_default: strictPositiveIntSchema,
    default_limit: strictPositiveIntSchema,
    override_limit: z.number().int().min(SELLER_LIMIT_OVERRIDE_MIN).max(SELLER_LIMIT_OVERRIDE_MAX).nullable(),
    effective_limit: coercedCount,
    active_count: coercedCount,
    pending_count: coercedCount,
    used_count: coercedCount,
    remaining_count: coercedCount,
    over_limit: z.boolean(),
    override_min: coercedCount,
    override_max: strictPositiveIntSchema,
  }),
  listing_counts: z.object({
    total: coercedCount,
    public_visible: coercedCount,
    draft: coercedCount,
    pending: coercedCount,
    rejected: coercedCount,
    active: coercedCount,
    reserved: coercedCount,
    sold: coercedCount,
    traded: coercedCount,
    archived: coercedCount,
    removed: coercedCount,
  }),
  open_reports_count: coercedCount,
  engagement_30d: z.object({
    views: coercedCount,
    contacts: coercedCount,
    window_end_utc: utcDateSchema,
  }),
  recent_activity: z.array(sellerActivityItemSchema).max(12),
});

export type SellerDetail = z.infer<typeof sellerDetailSchema>;

export type SellerActionMessage =
  | 'signin'
  | 'denied'
  | 'reasonRequired'
  | 'invalidAllowance'
  | 'confirmRequired'
  | 'conflict'
  | 'capacityExceeded'
  | 'invalidInput'
  | 'actionFailed';

export type SellerActionState = {
  message?: SellerActionMessage;
  reason?: string;
  limitInput?: string;
  targetType?: (typeof ACCOUNT_TYPES)[number];
  targetStatus?: SellerModerationTarget;
};

export function parseAccountTypeUpdateForm(
  form: FormData,
):
  | { ok: true; accountType: (typeof ACCOUNT_TYPES)[number]; reason: string }
  | { ok: false; message: 'reasonRequired' | 'invalidInput'; reason: string } {
  const reason = String(form.get('reason') ?? '').trim();
  const parsedType = accountTypeSchema.safeParse(form.get('accountType'));
  if (!parsedType.success) {
    return { ok: false, message: 'invalidInput', reason };
  }
  if (!reason || reason.length > MODERATION_NOTE_MAX_LENGTH) {
    return { ok: false, message: 'reasonRequired', reason };
  }
  return { ok: true, accountType: parsedType.data, reason };
}

export function parseListingLimitUpdateForm(
  form: FormData,
):
  | { ok: true; intent: 'set'; limitOverride: number; reason: string; limitInput: string }
  | { ok: true; intent: 'reset'; limitOverride: null; reason: string; limitInput: string }
  | {
      ok: false;
      message: 'reasonRequired' | 'invalidAllowance' | 'invalidInput';
      reason: string;
      limitInput: string;
    } {
  const intentRaw = String(form.get('intent') ?? '');
  const reason = String(form.get('reason') ?? '').trim();
  const limitInput = String(form.get('limitOverride') ?? '').trim();

  if (intentRaw !== 'set' && intentRaw !== 'reset') {
    return { ok: false, message: 'invalidInput', reason, limitInput };
  }
  if (!reason || reason.length > MODERATION_NOTE_MAX_LENGTH) {
    return { ok: false, message: 'reasonRequired', reason, limitInput };
  }

  if (intentRaw === 'reset') {
    return { ok: true, intent: 'reset', limitOverride: null, reason, limitInput };
  }

  if (!/^\d{1,3}$/.test(limitInput)) {
    return { ok: false, message: 'invalidAllowance', reason, limitInput };
  }
  const value = Number(limitInput);
  if (
    !Number.isSafeInteger(value) ||
    value < SELLER_LIMIT_OVERRIDE_MIN ||
    value > SELLER_LIMIT_OVERRIDE_MAX
  ) {
    return { ok: false, message: 'invalidAllowance', reason, limitInput };
  }

  return { ok: true, intent: 'set', limitOverride: value, reason, limitInput };
}

const moderationTargetSchema = z.enum(SELLER_MODERATION_TARGETS);

export function parseSellerModerationForm(
  form: FormData,
):
  | { ok: true; targetStatus: SellerModerationTarget; reason: string }
  | {
      ok: false;
      message: 'reasonRequired' | 'confirmRequired' | 'invalidInput';
      reason: string;
      targetStatus?: SellerModerationTarget;
    } {
  const reason = String(form.get('reason') ?? '').trim();
  const parsedStatus = moderationTargetSchema.safeParse(form.get('targetStatus'));
  const targetStatus = parsedStatus.success ? parsedStatus.data : undefined;

  if (!parsedStatus.success) {
    return { ok: false, message: 'invalidInput', reason };
  }
  if (!reason || reason.length > MODERATION_NOTE_MAX_LENGTH) {
    return { ok: false, message: 'reasonRequired', reason, targetStatus };
  }
  if (form.get('confirmModeration') !== 'yes') {
    return { ok: false, message: 'confirmRequired', reason, targetStatus };
  }

  return { ok: true, targetStatus: parsedStatus.data, reason };
}

export function mapAdminSellerRpcError(
  error: (RpcErrorLike & { message?: string | null }) | null | undefined,
): SellerActionMessage {
  const kind = classifyRpcError(error);
  if (kind === 'conflict') {
    const rawMessage = (error?.message ?? '').toLowerCase();
    if (
      rawMessage.includes('allowance') ||
      rawMessage.includes('usage') ||
      rawMessage.includes('limit')
    ) {
      return 'capacityExceeded';
    }
    return 'conflict';
  }
  if (kind === 'forbidden') return 'denied';
  if (kind === 'invalid_input') return 'invalidInput';
  return 'actionFailed';
}

export { ACCOUNT_STATUSES, ACCOUNT_TYPES };
