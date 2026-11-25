import { reconcileListingPhotos, uploadPhoto } from '@/features/photos/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Sized for slow mobile body read (30s) + Sharp processing (10s) + Storage upload (15s) + DB commit.
export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ listingId: string }> },
) {
  return reconcileListingPhotos(request, (await params).listingId);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ listingId: string }> },
) {
  return uploadPhoto(request, (await params).listingId);
}
