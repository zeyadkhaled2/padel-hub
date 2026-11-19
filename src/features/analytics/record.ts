import 'server-only';
import { publicClient } from '@/features/marketplace/public-data';

export async function recordMetric(id: string, kind: 'view' | 'contact') {
  try {
    const client = publicClient(true);
    if (!client) return;
    const { error } = await client.rpc('record_listing_metric', { p_listing: id, p_kind: kind }).abortSignal(AbortSignal.timeout(2000));
    if (error) console.warn('Listing analytics write unavailable');
  } catch { console.warn('Listing analytics write unavailable'); }
}
