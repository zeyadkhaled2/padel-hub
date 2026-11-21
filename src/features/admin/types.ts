import type {
  AccountStatus,
  AccountType,
  BrandSlug,
  EquipmentCategory,
  GovernorateSlug,
  ListingCondition,
  ListingStatus,
  OfferType,
  RacketShape,
} from '@/lib/domain/equipment';
import type { PhotoManifest } from '@/features/photos/types';

export type AdminAccess = {
  is_admin: boolean;
  mfa_verified: boolean;
};

export type AdminNavSectionId =
  | 'overview'
  | 'listings'
  | 'sellers'
  | 'reports'
  | 'analytics'
  | 'audit'
  | 'settings'
  | 'operations';

export type AdminOverviewKpis = {
  sellers_total: number;
  sellers_active: number;
  sellers_suspended: number;
  sellers_hidden: number;
  listings_total: number;
  listings_active: number;
  listings_pending: number;
  listings_rejected: number;
  listings_draft: number;
  listings_sold: number;
  listings_traded: number;
  listings_archived: number;
  listings_removed: number;
  open_reports: number;
  views_30d: number;
  contacts_30d: number;
  views_7d: number;
  contacts_7d: number;
};

export type AdminNeedsAttention = {
  pending_listings: number;
  oldest_pending_submitted_at: string | null;
  open_reports: number;
  oldest_open_report_at: string | null;
  suspended_sellers: number;
};

export type AdminTrendPeriod = {
  views: number;
  contacts: number;
  new_sellers: number;
  new_listings: number;
  submitted_listings: number;
  new_reports: number;
};

export type AdminDailyEngagementPoint = {
  day: string;
  views: number;
  contacts: number;
};

export type AdminOverviewTrends = {
  period_7d: AdminTrendPeriod;
  period_30d: AdminTrendPeriod;
  daily_engagement: AdminDailyEngagementPoint[];
};

export type AdminActivityItem = {
  id: number;
  actor_role: 'admin' | 'moderator' | 'owner';
  action: string;
  target_type: 'listing' | 'profile';
  target_id: string;
  target_label: string | null;
  target_status: string | null;
  reason: string | null;
  created_at: string;
};

export type AdminDashboardOverview = {
  generated_at: string;
  window_end_utc: string;
  kpis: AdminOverviewKpis;
  needs_attention: AdminNeedsAttention;
  trends: AdminOverviewTrends;
  recent_activity: AdminActivityItem[];
};

export type PendingListingSummary = {
  id: string;
  title: string | null;
  category: EquipmentCategory;
  submitted_at: string | null;
  display_name: string;
};

export type PendingListingsPage = {
  total: number;
  items: PendingListingSummary[];
};

export type ReviewListing = {
  id: string;
  seller_id: string;
  category: EquipmentCategory;
  status: ListingStatus;
  title: string | null;
  brand_slug: BrandSlug | null;
  brand_custom: string | null;
  model: string | null;
  description: string | null;
  governorate_slug: GovernorateSlug | null;
  district_text: string | null;
  condition: ListingCondition | null;
  condition_disclosure: string | null;
  offer_type: OfferType | null;
  price_egp: number | null;
  is_negotiable: boolean;
  swap_preference: string | null;
  racket_damage_repair_disclosure: string | null;
  racket_year: number | null;
  racket_shape: RacketShape | null;
  racket_weight_grams: number | null;
  racket_purchase_date: string | null;
  shoe_size_eu: number | null;
  balls_quantity_packaging: string | null;
  balls_availability_note: string | null;
  version: number;
  content_version: number;
  last_approved_content_version: number | null;
  submitted_at: string | null;
};

export type ReviewProfile = {
  user_id: string;
  version: number;
  username: string;
  display_name: string;
  account_type: AccountType;
  account_status: AccountStatus;
  is_public: boolean;
  public_contact_consent: boolean;
  has_contact: boolean;
};

export type ReviewMediaItem = {
  media_id: string;
  sort_order: number;
  ready_attempt_id: string;
  content_sha256: string;
  variants: PhotoManifest;
};

export type ReviewSnapshot = {
  listing: ReviewListing;
  profile: ReviewProfile;
  media_manifest: ReviewMediaItem[];
};

export type MfaMessage = 'signin' | 'denied' | 'unavailable' | 'alreadyEnrolled' | 'invalidCode';

export type MfaState = {
  message?: MfaMessage;
  factor?: string;
  secret?: string;
};

export type ReviewDecisionIntent = 'approve' | 'reject';

export type ReviewDecisionMessage =
  | 'signin'
  | 'reasonRequired'
  | 'conflict'
  | 'denied'
  | 'decisionFailed';

export type ReviewDecisionState = {
  message?: ReviewDecisionMessage;
  reason?: string;
};

export const REVIEW_DISPLAY_FIELD_KEYS = [
  'category',
  'title',
  'brand_slug',
  'brand_custom',
  'model',
  'description',
  'governorate_slug',
  'district_text',
  'condition',
  'condition_disclosure',
  'offer_type',
  'price_egp',
  'is_negotiable',
  'swap_preference',
  'racket_damage_repair_disclosure',
  'racket_year',
  'racket_shape',
  'racket_weight_grams',
  'racket_purchase_date',
  'shoe_size_eu',
  'balls_quantity_packaging',
  'balls_availability_note',
] as const;

export type ReviewDisplayFieldKey = (typeof REVIEW_DISPLAY_FIELD_KEYS)[number];
