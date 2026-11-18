import { uploadPhoto } from '@/features/photos/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, { params }: { params: Promise<{ listingId: string }> }) {
  return uploadPhoto(request, (await params).listingId);
}
