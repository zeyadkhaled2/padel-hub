import { deliverPhoto } from '@/features/photos/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  return deliverPhoto(request, (await params).mediaId);
}
export const HEAD = GET;
