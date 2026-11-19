import { after } from 'next/server';
import { z } from 'zod';
import { authConfig } from '@/server/supabase/config';
import { recordMetric } from '@/features/analytics/record';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const config = authConfig();
  const { id } = await params;
  if (!config || request.headers.get('origin') !== new URL(config.origin).origin || !z.uuid().safeParse(id).success) {
    return new Response(null, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  after(() => recordMetric(id, 'view'));
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
