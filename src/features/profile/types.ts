export type Profile = {
  username: string; display_name: string; governorate_slug: string;
  account_type: 'individual' | 'business'; bio: string | null; district_text: string | null;
  favorite_racket: string | null; is_public: boolean; account_status: string;
  version: number; contact_version: number; whatsapp_e164: string | null; public_contact_consent: boolean;
};
export type ProfileState = {
  profile: Profile | null; message?: string; errors?: Record<string, string>;
  values?: Record<string, string>; intent?: string;
};
export const governorates = ['cairo','giza','alexandria','dakahlia','red_sea','beheira','fayoum','gharbia','ismailia','menoufia','minya','qalyubia','new_valley','suez','aswan','assiut','beni_suef','port_said','damietta','sharqia','south_sinai','kafr_el_sheikh','matrouh','luxor','qena','north_sinai','sohag'] as const;
