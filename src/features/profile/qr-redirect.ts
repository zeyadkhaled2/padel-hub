import { uuidSchema } from '@/lib/validation/shared';
import { resolvePublicProfileUsername } from './server';

const QR_REDIRECT_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex',
};

export async function profileQrRedirect(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    return new Response(null, { status: 404, headers: QR_REDIRECT_HEADERS });
  }

  const resolved = await resolvePublicProfileUsername(id);
  if (resolved.status === 'unavailable') {
    return new Response(null, { status: 503, headers: QR_REDIRECT_HEADERS });
  }
  if (resolved.status === 'not_found') {
    return new Response(null, { status: 404, headers: QR_REDIRECT_HEADERS });
  }

  return new Response(null, {
    status: 302,
    headers: {
      ...QR_REDIRECT_HEADERS,
      Location: `/@${encodeURIComponent(resolved.username)}`,
    },
  });
}
