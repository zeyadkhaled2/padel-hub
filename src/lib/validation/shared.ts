import { z } from 'zod';
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  CURATED_BRANDS,
  EGYPT_GOVERNORATES,
  EQUIPMENT_CATEGORIES,
  LISTING_CONDITIONS,
  LISTING_PRICE_BOUNDS,
  LISTING_STATUSES,
  MAX_PAGE,
  OFFER_TYPES,
  PUBLIC_LISTING_STATUSES,
  RACKET_SHAPES,
  RACKET_WEIGHT_BOUNDS,
  RACKET_YEAR_BOUNDS,
  SHOE_SIZE_BOUNDS,
} from '@/lib/domain/equipment';

export const uuidSchema = z.uuid();
export const positiveVersionSchema = z.coerce.number().int().positive();
export const strictPositiveIntSchema = z.number().int().positive();
export const nonNegativeIntSchema = z.number().int().nonnegative();

export const usernameSchema = z.string().regex(/^[A-Za-z0-9_]{3,24}$/);
export const whatsappE164Schema = z.string().regex(/^\+[1-9][0-9]{7,14}$/);

export const equipmentCategorySchema = z.enum(EQUIPMENT_CATEGORIES);
export const listingStatusSchema = z.enum(LISTING_STATUSES);
export const publicListingStatusSchema = z.enum(PUBLIC_LISTING_STATUSES);
export const listingConditionSchema = z.enum(LISTING_CONDITIONS);
export const offerTypeSchema = z.enum(OFFER_TYPES);
export const racketShapeSchema = z.enum(RACKET_SHAPES);
export const brandSlugSchema = z.enum(CURATED_BRANDS);
export const governorateSlugSchema = z.enum(EGYPT_GOVERNORATES);
export const accountTypeSchema = z.enum(ACCOUNT_TYPES);
export const accountStatusSchema = z.enum(ACCOUNT_STATUSES);

export const listingPriceSchema = z
  .number()
  .int()
  .min(LISTING_PRICE_BOUNDS.min)
  .max(LISTING_PRICE_BOUNDS.max);

export const shoeSizeEuSchema = z
  .number()
  .finite()
  .min(SHOE_SIZE_BOUNDS.min)
  .max(SHOE_SIZE_BOUNDS.max)
  .refine((value) => (value * 2) % 1 === 0, 'Must be a whole or half EU shoe size');

export const racketYearSchema = z
  .number()
  .int()
  .min(RACKET_YEAR_BOUNDS.min)
  .max(RACKET_YEAR_BOUNDS.max);

export const racketWeightGramsSchema = z
  .number()
  .int()
  .min(RACKET_WEIGHT_BOUNDS.min)
  .max(RACKET_WEIGHT_BOUNDS.max);

export function parseOptionalBoundedInt(
  raw: string | undefined,
  schema: z.ZodNumber,
): { ok: true; value: number | null } | { ok: false } {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') {
    return { ok: true, value: null };
  }
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false };
  }
  const parsed = schema.safeParse(Number(trimmed));
  if (!parsed.success) {
    return { ok: false };
  }
  return { ok: true, value: parsed.data };
}

export function optionalTrimmedText(maxLength: number) {
  return z
    .string()
    .trim()
    .max(maxLength)
    .transform((value) => value || null);
}

export function parseShoeSizeEuInput(
  raw: string,
  options: { strictFormat?: boolean } = {},
): { ok: true; value: number | null } | { ok: false } {
  if (raw === '') {
    return { ok: true, value: null };
  }
  if (options.strictFormat && !/^\d{2}(?:\.5|\.0)?$/.test(raw)) {
    return { ok: false };
  }
  const numeric = Number(raw);
  const parsed = shoeSizeEuSchema.safeParse(numeric);
  if (!parsed.success) {
    return { ok: false };
  }
  return { ok: true, value: parsed.data };
}

export function parsePageParam(
  raw: string | undefined,
): { ok: true; page: number } | { ok: false } {
  if (raw === undefined || raw === '') {
    return { ok: true, page: 1 };
  }
  if (!/^\d{1,5}$/.test(raw)) {
    return { ok: false };
  }
  const page = Number(raw);
  if (!Number.isSafeInteger(page) || page < 1 || page > MAX_PAGE) {
    return { ok: false };
  }
  return { ok: true, page };
}

export function parseProfileHandle(rawHandle: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawHandle);
  } catch {
    return null;
  }
  if (!decoded.startsWith('@')) {
    return null;
  }
  const candidate = decoded.slice(1);
  return usernameSchema.safeParse(candidate).success ? candidate : null;
}

export function readFormStrings(form: FormData): Record<string, string> {
  const entries: [string, string][] = [];
  for (const [key, value] of form.entries()) {
    if (!key.startsWith('$') && typeof value === 'string') {
      entries.push([key, value]);
    }
  }
  return Object.fromEntries(entries);
}
