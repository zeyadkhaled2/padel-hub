import {
  CURATED_BRANDS,
  LISTING_TEXT_LIMITS,
  type BrandSlug,
  type EquipmentCategory,
  type GovernorateSlug,
  type ListingCondition,
  type ListingStatus,
  type ListingTextFieldKey,
  type OfferType,
  type RacketShape,
} from '@/lib/domain/equipment';

type BaseOwnerListing = {
  id: string;
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
  price_egp: number | null;
  is_negotiable: boolean;
  version: number;
  content_version: number;
  last_approved_content_version: number | null;
  media_ids: string[];
};

export type RacketOwnerListing = BaseOwnerListing & {
  category: 'rackets';
  offer_type: OfferType | null;
  swap_preference: string | null;
  racket_damage_repair_disclosure: string | null;
  racket_year: number | null;
  racket_shape: RacketShape | null;
  racket_weight_grams: number | null;
  racket_purchase_date: string | null;
  shoe_size_eu: null;
  balls_quantity_packaging: null;
  balls_availability_note: null;
};

export type BallsOwnerListing = BaseOwnerListing & {
  category: 'balls';
  offer_type: 'sale' | null;
  swap_preference: null;
  racket_damage_repair_disclosure: null;
  racket_year: null;
  racket_shape: null;
  racket_weight_grams: null;
  racket_purchase_date: null;
  shoe_size_eu: null;
  balls_quantity_packaging: string | null;
  balls_availability_note: string | null;
};

export type ShoesOwnerListing = BaseOwnerListing & {
  category: 'shoes';
  offer_type: 'sale' | null;
  swap_preference: null;
  racket_damage_repair_disclosure: null;
  racket_year: null;
  racket_shape: null;
  racket_weight_grams: null;
  racket_purchase_date: null;
  shoe_size_eu: number | null;
  balls_quantity_packaging: null;
  balls_availability_note: null;
};

export type BagsOwnerListing = BaseOwnerListing & {
  category: 'bags';
  offer_type: 'sale' | null;
  swap_preference: null;
  racket_damage_repair_disclosure: null;
  racket_year: null;
  racket_shape: null;
  racket_weight_grams: null;
  racket_purchase_date: null;
  shoe_size_eu: null;
  balls_quantity_packaging: null;
  balls_availability_note: null;
};

export type Listing =
  | RacketOwnerListing
  | BallsOwnerListing
  | ShoesOwnerListing
  | BagsOwnerListing;

export type OwnerListingSummary = {
  id: string;
  category: EquipmentCategory;
  title: string | null;
  status: ListingStatus;
};

export type PhotoDraftSummary = {
  id: string;
  category: EquipmentCategory;
  title: string | null;
  version: number;
};

export type ListingRejectionDecision = {
  decision: 'rejected';
  reason: string;
  decided_at: string | null;
};

export type ListingEditorMessage =
  | 'saved'
  | 'submitted'
  | 'withdrawn'
  | 'statusUpdated'
  | 'session'
  | 'invalid'
  | 'unavailable'
  | 'conflict'
  | 'conflictOrLimit'
  | 'requirements';

export type ListingFormFieldKey =
  | ListingTextFieldKey
  | 'brand_slug'
  | 'governorate_slug'
  | 'condition'
  | 'offer_type'
  | 'price_egp'
  | 'shoe_size_eu';

export type ListingDraftPatch = {
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
  shoe_size_eu: number | null;
  balls_quantity_packaging: string | null;
  balls_availability_note: string | null;
};

export type ListingState = {
  listing: Listing;
  message?: ListingEditorMessage;
  values?: Record<string, string>;
};

export const textFields = LISTING_TEXT_LIMITS;
export const brands = CURATED_BRANDS;
