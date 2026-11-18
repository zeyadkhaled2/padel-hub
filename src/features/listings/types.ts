export type Listing = {
  id: string; version: number; category: 'rackets' | 'balls'; status: string;
  media_ids: string[]; is_negotiable: boolean;
  [key: string]: string | number | boolean | string[] | null;
};
export type ListingState = { listing: Listing; message?: string; values?: Record<string, string> };
export const textFields = { title: 120, brand_custom: 60, model: 120, description: 3000, district_text: 80, condition_disclosure: 1000, swap_preference: 500, racket_damage_repair_disclosure: 1000, balls_quantity_packaging: 120, balls_availability_note: 160 };
export const brands = ['adidas','babolat','bullpadel','head','nox','siux','starvie','wilson','varlion','kuikma','drop_shot','royal_padel','technical','other'];
