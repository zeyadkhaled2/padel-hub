import { z } from 'zod';
import { publicListingSchema } from '@/features/marketplace/search';
import { classifyRpcError, type RpcErrorLike } from '@/lib/errors/domain';
import {
  accountStatusSchema,
  accountTypeSchema,
  governorateSlugSchema,
  nonNegativeIntSchema,
  optionalTrimmedText,
  positiveVersionSchema,
  strictPositiveIntSchema,
  usernameSchema,
  uuidSchema,
  whatsappE164Schema,
} from '@/lib/validation/shared';
import {
  PROFILE_TEXT_LIMITS,
  type Profile,
  type ProfileFieldErrorKey,
  type ProfileFieldErrors,
  type ProfileFormField,
  type ProfileMessage,
  type PublicProfile,
} from './types';

const baseProfileDetailsSchema = z.object({
  display_name: z.string().trim().min(1).max(PROFILE_TEXT_LIMITS.display_name),
  governorate_slug: governorateSlugSchema,
  account_type: accountTypeSchema,
});

const createProfileSchema = baseProfileDetailsSchema.extend({
  username: usernameSchema,
});

const updateProfileDetailsSchema = baseProfileDetailsSchema.extend({
  bio: optionalTrimmedText(PROFILE_TEXT_LIMITS.bio),
  district_text: optionalTrimmedText(PROFILE_TEXT_LIMITS.district_text),
  favorite_racket: optionalTrimmedText(PROFILE_TEXT_LIMITS.favorite_racket),
});

const profileBundleSchema = z.object({
  username: usernameSchema,
  display_name: z.string(),
  governorate_slug: governorateSlugSchema,
  account_type: accountTypeSchema,
  bio: z.string().nullable(),
  district_text: z.string().nullable(),
  favorite_racket: z.string().nullable(),
  is_public: z.boolean(),
  account_status: accountStatusSchema,
  version: strictPositiveIntSchema,
  contact_version: strictPositiveIntSchema,
  whatsapp_e164: whatsappE164Schema.nullable(),
  public_contact_consent: z.boolean(),
});

const publicProfileSchema = z.object({
  public_id: uuidSchema,
  username: usernameSchema,
  display_name: z.string(),
  account_type: accountTypeSchema,
  bio: z.string().nullable(),
  governorate_slug: governorateSlugSchema,
  district_text: z.string().nullable(),
  favorite_racket: z.string().nullable(),
  items: z.array(publicListingSchema),
  total: nonNegativeIntSchema,
});

export type ProfileMutationCommand =
  | {
      ok: true;
      rpc: 'create_seller_profile';
      args: {
        p_username: string;
        p_display_name: string;
        p_governorate_slug: Profile['governorate_slug'];
        p_account_type: Profile['account_type'];
      };
    }
  | {
      ok: true;
      rpc: 'update_seller_profile';
      args: {
        p_expected_version: number;
        p_patch: {
          display_name: string;
          governorate_slug: Profile['governorate_slug'];
          account_type: Profile['account_type'];
          bio: string | null;
          district_text: string | null;
          favorite_racket: string | null;
          is_public: boolean;
        };
      };
    }
  | {
      ok: true;
      rpc: 'update_my_contact';
      args: {
        p_expected_profile_version: number;
        p_expected_contact_version: number;
        p_whatsapp_e164: string | null;
        p_public_contact_consent: boolean;
      };
    }
  | {
      ok: false;
      message: ProfileMessage;
      errors?: ProfileFieldErrors;
    };

function mapIssuesToFieldErrors(
  issues: z.core.$ZodIssue[],
  override?: Partial<Record<ProfileFormField, ProfileFieldErrorKey>>,
): ProfileFieldErrors {
  const errors: ProfileFieldErrors = {};
  for (const issue of issues) {
    const field = String(issue.path[0]) as ProfileFormField;
    errors[field] = override?.[field] ?? 'invalidField';
  }
  return errors;
}

export function parseProfileMutation(
  values: Record<string, string>,
  hasProfile: boolean,
): ProfileMutationCommand {
  const intent = values.intent ?? '';

  if (intent === 'create') {
    const parsed = createProfileSchema.safeParse(values);
    if (!parsed.success) {
      return {
        ok: false,
        message: 'invalidFields',
        errors: mapIssuesToFieldErrors(parsed.error.issues, { username: 'usernameHint' }),
      };
    }
    return {
      ok: true,
      rpc: 'create_seller_profile',
      args: {
        p_username: parsed.data.username,
        p_display_name: parsed.data.display_name,
        p_governorate_slug: parsed.data.governorate_slug,
        p_account_type: parsed.data.account_type,
      },
    };
  }

  const expectedVersion = positiveVersionSchema.safeParse(values.version);
  if (!hasProfile || !expectedVersion.success) {
    return { ok: false, message: 'conflict' };
  }

  if (intent === 'details') {
    const parsed = updateProfileDetailsSchema.safeParse(values);
    if (!parsed.success) {
      return {
        ok: false,
        message: 'invalidFields',
        errors: mapIssuesToFieldErrors(parsed.error.issues),
      };
    }
    return {
      ok: true,
      rpc: 'update_seller_profile',
      args: {
        p_expected_version: expectedVersion.data,
        p_patch: {
          ...parsed.data,
          is_public: values.is_public === 'on',
        },
      },
    };
  }

  if (intent === 'contact') {
    const contactVersion = positiveVersionSchema.safeParse(values.contact_version);
    if (!contactVersion.success) {
      return { ok: false, message: 'conflict' };
    }
    const phone = (values.whatsapp_e164 ?? '').trim();
    const consent = values.public_contact_consent === 'on';
    const phoneInvalid = phone !== '' && !whatsappE164Schema.safeParse(phone).success;
    if (phoneInvalid || (!phone && consent)) {
      return {
        ok: false,
        message: 'invalidFields',
        errors: { whatsapp_e164: 'phoneHint' },
      };
    }
    return {
      ok: true,
      rpc: 'update_my_contact',
      args: {
        p_expected_profile_version: expectedVersion.data,
        p_expected_contact_version: contactVersion.data,
        p_whatsapp_e164: phone || null,
        p_public_contact_consent: consent,
      },
    };
  }

  return { ok: false, message: 'invalidFields' };
}

export function mapProfileRpcError(error: RpcErrorLike): {
  message: ProfileMessage;
  errors?: ProfileFieldErrors;
} {
  switch (classifyRpcError(error)) {
    case 'conflict':
      return { message: 'conflict' };
    case 'duplicate':
      return {
        message: 'usernameUnavailable',
        errors: { username: 'usernameUnavailable' },
      };
    case 'forbidden':
      return { message: 'notAllowed' };
    default:
      return { message: 'saveFailed' };
  }
}

export function parseProfileBundle(raw: unknown): Profile | null {
  if (raw === null || raw === undefined) return null;
  const parsed = profileBundleSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parsePublicProfile(raw: unknown): PublicProfile | null {
  if (raw === null || raw === undefined) return null;
  const parsed = publicProfileSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
