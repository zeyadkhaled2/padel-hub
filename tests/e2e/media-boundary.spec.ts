import { test, expect } from '@playwright/test';

test('image optimizer accepts fixed artwork and rejects protected paths', async ({ request, baseURL }) => {
  const optimize = (url: string) => request.get('/_next/image', { params: { url, w: '640', q: '75' } });
  const allowed = await optimize('/images/demo/racket-court.webp');
  expect(allowed.status()).toBe(200);
  expect(allowed.headers()['content-type']).toMatch(/^image\//);

  for (const path of [
    '/api/media/listings/listing/media/card',
    '/api/media/owner/media/full',
    '/en/api/media/listings/listing/media/card',
    '/ar/api/media/listings/listing/media/card',
    '/account/photos/media',
    '/images/demo/racket-court.webp?protected=true',
    `${baseURL}/api/media/listings/listing/media/card`,
    'http://localhost:54321/storage/v1/object/public/media-private/photo.webp',
  ]) {
    const denied = await optimize(path);
    expect(denied.status(), path).toBe(400);
    expect(await denied.text()).toContain('not allowed');
  }
});
