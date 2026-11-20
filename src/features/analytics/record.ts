import 'server-only';
import { serviceClient } from '@/server/supabase/clients';

export async function recordMetric(id: string, kind: 'view' | 'contact') {
  try {
    const client = serviceClient(2_000);
    if (!client) return;
    const { error } = await client
      .rpc('record_listing_metric', { p_listing: id, p_kind: kind })
      .abortSignal(AbortSignal.timeout(2_000));
    if (error) console.warn('Listing analytics write unavailable');
  } catch {
    console.warn('Listing analytics write unavailable');
  }
}
