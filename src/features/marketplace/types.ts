import type {
  AccountType,
  BrandSlug,
  EquipmentCategory,
  GovernorateSlug,
  ListingCondition,
  OfferType,
  PublicListingStatus,
  RacketShape,
  SearchSortOption,
} from '@/lib/domain/equipment';

export type PublicSellerSummary = {
  display_name: string;
  username: string;
  account_type: AccountType;
};

type BasePublicListing = {
  id: string;
  title: string;
  status: PublicListingStatus;
  brand_slug: BrandSlug;
  brand_custom: string | null;
  model: string;
  description: string;
  governorate_slug: GovernorateSlug;
  district_text: string | null;
  condition: ListingCondition;
  condition_disclosure: string;
  price_egp: number | null;
  is_negotiable: boolean;
  last_confirmed_available_at: string | null;
  published_at?: string | null;
  media_ids: string[];
  seller: PublicSellerSummary;
};

export type PublicRacketListing = BasePublicListing & {
  category: 'rackets';
  offer_type: OfferType;
  swap_preference: string | null;
  racket_damage_repair_disclosure: string;
  racket_year: number | null;
  racket_shape: RacketShape | null;
  racket_weight_grams: number | null;
  racket_purchase_date: string | null;
  shoe_size_eu: null;
  balls_quantity_packaging: null;
  balls_availability_note: null;
};

export type PublicBallsListing = BasePublicListing & {
  category: 'balls';
  offer_type: 'sale';
  price_egp: number;
  swap_preference: null;
  racket_damage_repair_disclosure: null;
  racket_year: null;
  racket_shape: null;
  racket_weight_grams: null;
  racket_purchase_date: null;
  shoe_size_eu: null;
  balls_quantity_packaging: string;
  balls_availability_note: string | null;
};

export type PublicShoesListing = BasePublicListing & {
  category: 'shoes';
  offer_type: 'sale';
  price_egp: number;
  swap_preference: null;
  racket_damage_repair_disclosure: null;
  racket_year: null;
  racket_shape: null;
  racket_weight_grams: null;
  racket_purchase_date: null;
  shoe_size_eu: number;
  balls_quantity_packaging: null;
  balls_availability_note: null;
};

export type PublicBagsListing = BasePublicListing & {
  category: 'bags';
  offer_type: 'sale';
  price_egp: number;
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

export type PublicListing =
  | PublicRacketListing
  | PublicBallsListing
  | PublicShoesListing
  | PublicBagsListing;

export type Query = Record<string, string | string[] | undefined>;

export type MarketplaceSearchValues = {
  q: string;
  category: string;
  governorate: string;
  brand: string;
  condition: string;
  offer: string;
  min: string;
  max: string;
  sort: string;
  page: string;
  size: string;
};

export type ParsedMarketplaceSearch = {
  q: string;
  category: '' | EquipmentCategory;
  governorate: string;
  brand: string;
  condition: '' | ListingCondition;
  offer: '' | OfferType;
  min: number | null;
  max: number | null;
  sort: SearchSortOption;
  page: number;
  shoeSize: number | null;
};

export type PublicSearchResult =
  | { status: 'ok'; items: PublicListing[]; total: number }
  | { status: 'invalid'; items: []; total: 0 }
  | { status: 'unavailable'; items: []; total: 0 };

export type PublicListingLookupResult =
  | { status: 'ok'; listing: PublicListing }
  | { status: 'not_found' }
  | { status: 'unavailable' };

export type ListingContact = {
  title: string;
  phone: string;
};

export type PublicDetailFieldKey =
  | 'shoe_size_eu'
  | 'model'
  | 'description'
  | 'condition_disclosure'
  | 'racket_damage_repair_disclosure'
  | 'swap_preference'
  | 'balls_quantity_packaging'
  | 'balls_availability_note';
