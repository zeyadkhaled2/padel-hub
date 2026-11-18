import { z } from 'zod';
import { publicClient } from '@/features/marketplace/public-data';

export async function profileQrRedirect(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };
  if (!z.uuid().safeParse(id).success) return new Response(null, { status: 404, headers });
  const client = publicClient();
  if (!client) return new Response(null, { status: 503, headers });
  const { data, error } = await client.rpc('resolve_public_profile', { p_public_id: id });
  if (error) return new Response(null, { status: 503, headers });
  if (!data) return new Response(null, { status: 404, headers });
  return new Response(null, { status: 302, headers: { ...headers, Location: `/@${encodeURIComponent(data)}` } });
}
