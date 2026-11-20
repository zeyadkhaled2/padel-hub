import 'server-only';
import { classifyRpcError } from '@/lib/errors/domain';
import { uuidSchema } from '@/lib/validation/shared';
import { anonClient } from '@/server/supabase/clients';
import {
  extractSearchValues,
  parseMarketplaceSearch,
  parsePublicListing,
  parsePublicSearchResponse,
} from './search';
import type {
  MarketplaceSearchValues,
  PublicListingLookupResult,
  PublicSearchResult,
} from './types';

export type {
  MarketplaceSearchValues,
  PublicListing,
  PublicListingLookupResult,
  PublicSearchResult,
  Query,
} from './types';
export { extractSearchValues as searchValues };

export async function searchPublic(
  values: MarketplaceSearchValues,
): Promise<PublicSearchResult> {
  const parsed = parseMarketplaceSearch(values);
  if (!parsed.ok) {
    return { status: 'invalid', items: [], total: 0 };
  }

  const client = anonClient();
  if (!client) {
    return { status: 'unavailable', items: [], total: 0 };
  }

  const { params } = parsed;
  const { data, error } = await client.rpc('search_public_listings', {
    p_query: params.q,
    p_category: params.category,
    p_governorate: params.governorate,
    p_brand: params.brand,
    p_condition: params.condition,
    p_offer: params.offer,
    p_min: params.min,
    p_max: params.max,
    p_sort: params.sort,
    p_page: params.page,
    p_shoe_size: params.shoeSize,
  });

  if (error) {
    return classifyRpcError(error) === 'invalid_input'
      ? { status: 'invalid', items: [], total: 0 }
      : { status: 'unavailable', items: [], total: 0 };
  }

  const response = parsePublicSearchResponse(data);
  if (!response) {
    return { status: 'unavailable', items: [], total: 0 };
  }
  return { status: 'ok', items: response.items, total: response.total };
}

export async function publicListing(id: string): Promise<PublicListingLookupResult> {
  if (!uuidSchema.safeParse(id).success) {
    return { status: 'not_found' };
  }

  const client = anonClient();
  if (!client) {
    return { status: 'unavailable' };
  }

  const { data, error } = await client.rpc('get_public_listing', { p_listing: id });
  if (error) {
    return { status: 'unavailable' };
  }
  if (data === null || data === undefined) {
    return { status: 'not_found' };
  }

  const listing = parsePublicListing(data);
  if (!listing) {
    return { status: 'unavailable' };
  }
  return { status: 'ok', listing };
}
