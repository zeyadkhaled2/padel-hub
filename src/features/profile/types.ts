import {
  EGYPT_GOVERNORATES,
  type AccountStatus,
  type AccountType,
  type GovernorateSlug,
} from '@/lib/domain/equipment';
import type { PublicListing } from '@/features/marketplace/types';

export const PROFILE_TEXT_LIMITS = {
  username: 24,
  display_name: 80,
  district_text: 80,
  bio: 500,
  favorite_racket: 120,
  whatsapp_e164: 16,
} as const;

export type Profile = {
  username: string;
  display_name: string;
  governorate_slug: GovernorateSlug;
  account_type: AccountType;
  bio: string | null;
  district_text: string | null;
  favorite_racket: string | null;
  is_public: boolean;
  account_status: AccountStatus;
  version: number;
  contact_version: number;
  whatsapp_e164: string | null;
  public_contact_consent: boolean;
};

export type PublicProfile = {
  public_id: string;
  username: string;
  display_name: string;
  account_type: AccountType;
  bio: string | null;
  governorate_slug: GovernorateSlug;
  district_text: string | null;
  favorite_racket: string | null;
  items: PublicListing[];
  total: number;
};

export type ProfileIntent = 'create' | 'details' | 'contact';

export type ProfileMessage =
  | 'saved'
  | 'sessionExpired'
  | 'loadFailed'
  | 'invalidFields'
  | 'usernameUnavailable'
  | 'conflict'
  | 'notAllowed'
  | 'saveFailed';

export type ProfileFormField =
  | 'username'
  | 'display_name'
  | 'governorate_slug'
  | 'account_type'
  | 'district_text'
  | 'bio'
  | 'favorite_racket'
  | 'whatsapp_e164'
  | 'is_public'
  | 'public_contact_consent';

export type ProfileFieldErrorKey =
  | 'usernameHint'
  | 'phoneHint'
  | 'invalidField'
  | 'usernameUnavailable';

export type ProfileFieldErrors = Partial<Record<ProfileFormField, ProfileFieldErrorKey>>;

export type ProfileState = {
  profile: Profile | null;
  message?: ProfileMessage;
  errors?: ProfileFieldErrors;
  values?: Record<string, string>;
  intent?: string;
};

export const governorates = EGYPT_GOVERNORATES;
