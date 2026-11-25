export const EQUIPMENT_CATEGORIES = ['rackets', 'balls', 'shoes', 'bags'] as const;
export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];

export const LISTING_STATUSES = [
  'draft',
  'pending',
  'rejected',
  'active',
  'reserved',
  'sold',
  'traded',
  'archived',
  'removed',
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const EDITABLE_LISTING_STATUSES: readonly ListingStatus[] = ['draft', 'rejected'];
export const WITHDRAWABLE_LISTING_STATUSES: readonly ListingStatus[] = ['pending', 'active', 'reserved'];
export const ARCHIVABLE_LISTING_STATUSES: readonly ListingStatus[] = ['pending', 'active'];
export const RELISTABLE_LISTING_STATUSES: readonly ListingStatus[] = ['sold', 'traded', 'archived'];

export const PUBLIC_LISTING_STATUSES = ['active', 'reserved', 'sold', 'traded'] as const;
export type PublicListingStatus = (typeof PUBLIC_LISTING_STATUSES)[number];

export const LISTING_CONDITIONS = ['new', 'used'] as const;
export type ListingCondition = (typeof LISTING_CONDITIONS)[number];

export const OFFER_TYPES = ['sale', 'swap', 'both'] as const;
export type OfferType = (typeof OFFER_TYPES)[number];

export const RACKET_SHAPES = ['round', 'teardrop', 'diamond', 'hybrid'] as const;
export type RacketShape = (typeof RACKET_SHAPES)[number];

export const LISTING_LIFECYCLE_ACTIONS = ['sold', 'traded', 'archive', 'relist', 'reopen'] as const;
export type ListingLifecycleAction = (typeof LISTING_LIFECYCLE_ACTIONS)[number];

export const LISTING_FORM_INTENTS = [
  'save',
  'submit',
  'withdraw',
  ...LISTING_LIFECYCLE_ACTIONS,
] as const;
export type ListingFormIntent = (typeof LISTING_FORM_INTENTS)[number];

export const CURATED_BRANDS = [
  'adidas',
  'babolat',
  'bullpadel',
  'head',
  'nox',
  'siux',
  'starvie',
  'wilson',
  'varlion',
  'kuikma',
  'drop_shot',
  'royal_padel',
  'technical',
  'other',
] as const;
export type BrandSlug = (typeof CURATED_BRANDS)[number];

export const EGYPT_GOVERNORATES = [
  'cairo',
  'giza',
  'alexandria',
  'dakahlia',
  'red_sea',
  'beheira',
  'fayoum',
  'gharbia',
  'ismailia',
  'menoufia',
  'minya',
  'qalyubia',
  'new_valley',
  'suez',
  'aswan',
  'assiut',
  'beni_suef',
  'port_said',
  'damietta',
  'sharqia',
  'south_sinai',
  'kafr_el_sheikh',
  'matrouh',
  'luxor',
  'qena',
  'north_sinai',
  'sohag',
] as const;
export type GovernorateSlug = (typeof EGYPT_GOVERNORATES)[number];

export const ACCOUNT_TYPES = ['individual', 'business'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_STATUSES = ['active', 'suspended', 'hidden'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const SEARCH_SORT_OPTIONS = ['', 'low', 'high'] as const;
export type SearchSortOption = (typeof SEARCH_SORT_OPTIONS)[number];

export const LISTING_TEXT_LIMITS = {
  title: 120,
  brand_custom: 60,
  model: 120,
  description: 3000,
  district_text: 80,
  condition_disclosure: 1000,
  swap_preference: 500,
  racket_damage_repair_disclosure: 1000,
  balls_quantity_packaging: 120,
  balls_availability_note: 160,
} as const;
export type ListingTextFieldKey = keyof typeof LISTING_TEXT_LIMITS;

export const CATEGORY_SPECIFIC_TEXT_FIELDS = [
  'racket_damage_repair_disclosure',
  'balls_quantity_packaging',
  'balls_availability_note',
] as const;
export type CategoryTextFieldKey = (typeof CATEGORY_SPECIFIC_TEXT_FIELDS)[number];

export const LISTING_PRICE_BOUNDS = {
  min: 1,
  max: 500_000,
  searchMin: 0,
} as const;

export const SHOE_SIZE_BOUNDS = {
  min: 20,
  max: 55,
  step: 0.5,
} as const;

export const RACKET_YEAR_BOUNDS = {
  min: 2010,
  max: 2035,
} as const;

export const RACKET_WEIGHT_BOUNDS = {
  min: 300,
  max: 420,
} as const;

export const SHOE_SIZES_EU: readonly number[] = Array.from(
  { length: (SHOE_SIZE_BOUNDS.max - SHOE_SIZE_BOUNDS.min) / SHOE_SIZE_BOUNDS.step + 1 },
  (_, index) => SHOE_SIZE_BOUNDS.min + index * SHOE_SIZE_BOUNDS.step,
);

export const MIN_LISTING_PHOTOS = 3;
export const MAX_LISTING_PHOTOS = 4;
export const PAGE_SIZE = 24;
export const MAX_PAGE = 10_000;
export const MAX_SEARCH_QUERY_LENGTH = 120;
export const MODERATION_NOTE_MAX_LENGTH = 1000;

export type CategoryTextFieldSpec = {
  readonly key: CategoryTextFieldKey;
  readonly multiline: boolean;
};

export type CategoryConfig = {
  readonly slug: EquipmentCategory;
  readonly minPhotos: number;
  readonly maxPhotos: number;
  readonly supportedOfferTypes: readonly OfferType[];
  readonly defaultOfferType: OfferType;
  readonly supportsSwap: boolean;
  readonly hasRacketSpecs: boolean;
  readonly hasShoeSize: boolean;
  readonly supportsShoeSizeFilter: boolean;
  readonly extraTextFields: readonly CategoryTextFieldSpec[];
};

export const CATEGORY_CONFIG: Readonly<Record<EquipmentCategory, CategoryConfig>> = {
  rackets: {
    slug: 'rackets',
    minPhotos: MIN_LISTING_PHOTOS,
    maxPhotos: MAX_LISTING_PHOTOS,
    supportedOfferTypes: ['sale', 'swap', 'both'],
    defaultOfferType: 'sale',
    supportsSwap: true,
    hasRacketSpecs: true,
    hasShoeSize: false,
    supportsShoeSizeFilter: false,
    extraTextFields: [{ key: 'racket_damage_repair_disclosure', multiline: true }],
  },
  balls: {
    slug: 'balls',
    minPhotos: MIN_LISTING_PHOTOS,
    maxPhotos: MAX_LISTING_PHOTOS,
    supportedOfferTypes: ['sale'],
    defaultOfferType: 'sale',
    supportsSwap: false,
    hasRacketSpecs: false,
    hasShoeSize: false,
    supportsShoeSizeFilter: false,
    extraTextFields: [
      { key: 'balls_quantity_packaging', multiline: false },
      { key: 'balls_availability_note', multiline: false },
    ],
  },
  shoes: {
    slug: 'shoes',
    minPhotos: MIN_LISTING_PHOTOS,
    maxPhotos: MAX_LISTING_PHOTOS,
    supportedOfferTypes: ['sale'],
    defaultOfferType: 'sale',
    supportsSwap: false,
    hasRacketSpecs: false,
    hasShoeSize: true,
    supportsShoeSizeFilter: true,
    extraTextFields: [],
  },
  bags: {
    slug: 'bags',
    minPhotos: MIN_LISTING_PHOTOS,
    maxPhotos: MAX_LISTING_PHOTOS,
    supportedOfferTypes: ['sale'],
    defaultOfferType: 'sale',
    supportsSwap: false,
    hasRacketSpecs: false,
    hasShoeSize: false,
    supportsShoeSizeFilter: false,
    extraTextFields: [],
  },
};

export function isEquipmentCategory(value: string): value is EquipmentCategory {
  return (EQUIPMENT_CATEGORIES as readonly string[]).includes(value);
}

export function getCategoryConfig(category: EquipmentCategory): CategoryConfig {
  return CATEGORY_CONFIG[category];
}

export function isListingEditable(status: ListingStatus): boolean {
  return EDITABLE_LISTING_STATUSES.includes(status);
}

export function isListingWithdrawable(status: ListingStatus): boolean {
  return WITHDRAWABLE_LISTING_STATUSES.includes(status);
}

export function isListingArchivable(status: ListingStatus): boolean {
  return ARCHIVABLE_LISTING_STATUSES.includes(status);
}

export function isListingRelistable(status: ListingStatus): boolean {
  return RELISTABLE_LISTING_STATUSES.includes(status);
}

export function meetsListingPhotoRules(photoCount: number): boolean {
  return photoCount >= MIN_LISTING_PHOTOS && photoCount <= MAX_LISTING_PHOTOS;
}

export function canMarkListingSold(status: ListingStatus, offerType: OfferType | null): boolean {
  return status === 'active' && (offerType === 'sale' || offerType === 'both');
}

export function canMarkListingTraded(
  category: EquipmentCategory,
  status: ListingStatus,
  offerType: OfferType | null,
): boolean {
  return (
    status === 'active' &&
    CATEGORY_CONFIG[category].supportsSwap &&
    (offerType === 'swap' || offerType === 'both')
  );
}

export function formatBrandLabel(brand: BrandSlug): string {
  return brand.replaceAll('_', ' ');
}
