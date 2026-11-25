import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { CLIENT_IMAGE_LIMITS, ClientImagePrepError } from '@/features/photos/client/constants';
import {
  canFallbackToOriginalOnPrepFailure,
  canPassthroughOriginal,
  computeResizedDimensions,
  inspectImageHeader,
  shouldPreferOriginalOverReencoded,
  validateClientSourceDimensions,
} from '@/features/photos/client/format';
import { decodeHeicBytes } from '@/features/photos/client/heic';

const REAL_HEVC_FIXTURE_PATH = join(process.cwd(), 'tests', 'fixtures', 'real-hevc-sample.heic');

test('inspectImageHeader detects JPEG, EXIF orientation, PNG alpha, WebP, GIF, and HEIC from magic bytes', async () => {
  // Rotated JPEG (EXIF Orientation = 6, 90° CW): raw 1200x800 -> oriented 800x1200
  const rotatedJpeg = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: '#14533c' },
  })
    .withMetadata({ orientation: 6 })
    .jpeg({ quality: 85 })
    .toBuffer();

  const jpegInfo = inspectImageHeader(new Uint8Array(rotatedJpeg));
  assert.equal(jpegInfo.format, 'jpeg');
  assert.equal(jpegInfo.isAnimated, false);
  assert.equal(jpegInfo.hasAlpha, false);
  assert.equal(jpegInfo.orientation, 6);
  assert.equal(jpegInfo.rawWidth, 1200);
  assert.equal(jpegInfo.rawHeight, 800);
  assert.equal(jpegInfo.orientedWidth, 800);
  assert.equal(jpegInfo.orientedHeight, 1200);
  // Rotated JPEG must NOT pass through without orientation normalization.
  assert.equal(canPassthroughOriginal(jpegInfo, rotatedJpeg.length), false);

  // Upright JPEG <= 2000px and <= 1 MB qualifies for passthrough (no unnecessary re-encoding).
  const uprightJpeg = await sharp({
    create: { width: 1400, height: 1050, channels: 3, background: '#2a6f54' },
  })
    .jpeg({ quality: 88 })
    .toBuffer();
  const uprightInfo = inspectImageHeader(new Uint8Array(uprightJpeg));
  assert.equal(uprightInfo.format, 'jpeg');
  assert.equal(uprightInfo.orientation, 1);
  assert.equal(uprightInfo.orientedWidth, 1400);
  assert.equal(uprightInfo.orientedHeight, 1050);
  assert.equal(canPassthroughOriginal(uprightInfo, uprightJpeg.length), true);

  // Large 48 MP header (> 2000 px) must NOT pass through, even if compressed < 1 MB.
  assert.equal(
    canPassthroughOriginal(
      {
        format: 'jpeg',
        isAnimated: false,
        hasAlpha: false,
        orientation: 1,
        rawWidth: 8064,
        rawHeight: 6048,
        orientedWidth: 8064,
        orientedHeight: 6048,
      },
      500_000,
    ),
    false,
  );

  // Transparent PNG: detects format, dimensions, and alpha channel.
  const transparentPng = await sharp({
    create: { width: 600, height: 450, channels: 4, background: { r: 20, g: 83, b: 60, alpha: 0.5 } },
  })
    .png()
    .toBuffer();
  const pngInfo = inspectImageHeader(new Uint8Array(transparentPng));
  assert.equal(pngInfo.format, 'png');
  assert.equal(pngInfo.hasAlpha, true);
  assert.equal(pngInfo.isAnimated, false);
  assert.equal(pngInfo.orientedWidth, 600);
  assert.equal(pngInfo.orientedHeight, 450);
  assert.equal(canPassthroughOriginal(pngInfo, transparentPng.length), true);

  // Still WebP with alpha: detects format, dimensions, and alpha.
  const webpAlpha = await sharp({
    create: { width: 900, height: 600, channels: 4, background: { r: 10, g: 40, b: 30, alpha: 0.4 } },
  })
    .webp({ quality: 85 })
    .toBuffer();
  const webpInfo = inspectImageHeader(new Uint8Array(webpAlpha));
  assert.equal(webpInfo.format, 'webp');
  assert.equal(webpInfo.isAnimated, false);
  assert.equal(webpInfo.hasAlpha, true);
  assert.equal(webpInfo.orientedWidth, 900);
  assert.equal(webpInfo.orientedHeight, 600);

  // Synthetic animated WebP VP8X header (animation flag bit 0x02 set).
  const animWebp = Buffer.alloc(30);
  animWebp.write('RIFF', 0, 'ascii');
  animWebp.writeUInt32LE(22, 4);
  animWebp.write('WEBP', 8, 'ascii');
  animWebp.write('VP8X', 12, 'ascii');
  animWebp.writeUInt32LE(10, 16);
  animWebp[20] = 0x02; // ANIM flag
  animWebp[24] = 99; // width - 1 = 99 -> 100
  animWebp[27] = 99; // height - 1 = 99 -> 100
  const animInfo = inspectImageHeader(new Uint8Array(animWebp));
  assert.equal(animInfo.format, 'webp');
  assert.equal(animInfo.isAnimated, true);
  assert.equal(canPassthroughOriginal(animInfo, 10_000), false);
  assert.equal(canFallbackToOriginalOnPrepFailure(animInfo, 10_000), false);

  // GIF & arbitrary text rejected.
  assert.equal(inspectImageHeader(Buffer.from('GIF89a......')).format, 'gif');
  assert.equal(inspectImageHeader(Buffer.from('<html>not an image</html>')).format, 'unknown');
});

test('resize math and client dimension bounds support 48 MP iPhone photos without enlarging small images', () => {
  // Never enlarge smaller photos.
  assert.deepEqual(computeResizedDimensions(1200, 900, 2000), { width: 1200, height: 900 });

  // 48 MP iPhone photo (8064x6048) is valid on client and scales cleanly to 2000x1500.
  assert.equal(validateClientSourceDimensions(8064, 6048), true);
  assert.deepEqual(computeResizedDimensions(8064, 6048, CLIENT_IMAGE_LIMITS.maxOutputDimension), {
    width: 2000,
    height: 1500,
  });

  // Portrait 48 MP scales longest edge (height) to 2000.
  assert.deepEqual(computeResizedDimensions(6048, 8064, 2000), { width: 1500, height: 2000 });

  // Extreme aspect ratio (e.g., 4000x100 -> at 1600px full width becomes 1600x40 < 64) rejected.
  assert.equal(validateClientSourceDimensions(4000, 100), false);

  // Tiny (<64px) and massive (>65 MP) rejected.
  assert.equal(validateClientSourceDimensions(40, 400), false);
  assert.equal(validateClientSourceDimensions(10_000, 8_000), false);

  // Original-file fallback on browser capability failure enforces <= 4 MB and forbids HEIC.
  const validSmallJpeg = {
    format: 'jpeg' as const,
    isAnimated: false,
    hasAlpha: false,
    orientation: 1,
    rawWidth: 1600,
    rawHeight: 1200,
    orientedWidth: 1600,
    orientedHeight: 1200,
  };
  assert.equal(canFallbackToOriginalOnPrepFailure(validSmallJpeg, 3_900_000), true);
  assert.equal(canFallbackToOriginalOnPrepFailure(validSmallJpeg, 4_000_001), false);
  assert.equal(
    canFallbackToOriginalOnPrepFailure({ ...validSmallJpeg, format: 'heic' }, 500_000),
    false,
  );

  // Prefer original when re-encoding inflates an already-valid upright image.
  assert.equal(
    shouldPreferOriginalOverReencoded({
      inspection: validSmallJpeg,
      originalBytes: 420_000,
      encodedBytes: 510_000,
    }),
    true,
  );
  assert.equal(
    shouldPreferOriginalOverReencoded({
      inspection: validSmallJpeg,
      originalBytes: 420_000,
      encodedBytes: 310_000,
    }),
    false,
  );
});

test('decodeHeicBytes decodes a real HEVC-encoded HEIC photograph and rejects corrupted HEIC cleanly', async () => {
  const realHeic = readFileSync(REAL_HEVC_FIXTURE_PATH);
  const info = inspectImageHeader(new Uint8Array(realHeic));
  assert.equal(info.format, 'heic');
  assert.equal(canPassthroughOriginal(info, realHeic.length), false);

  const decoded = await decodeHeicBytes(new Uint8Array(realHeic));
  assert.equal(decoded.width, 320);
  assert.equal(decoded.height, 240);
  assert.equal(decoded.rgba.length, 320 * 240 * 4);
  let nonBlackPixels = 0;
  for (let i = 0; i < decoded.rgba.length; i += 4) {
    if (decoded.rgba[i] > 0 || decoded.rgba[i + 1] > 0 || decoded.rgba[i + 2] > 0) {
      nonBlackPixels++;
    }
  }
  assert.ok(nonBlackPixels > 50_000, `Expected decoded HEVC image content, got ${nonBlackPixels} non-black pixels`);

  // Corrupted/truncated HEIC bytes fail with typed heicDecodeFailed error.
  const fakeHeic = Buffer.from('\0\0\0\x18ftypheic\0\0\0\0mif1heicCORRUPT_BODY');
  assert.equal(inspectImageHeader(new Uint8Array(fakeHeic)).format, 'heic');
  await assert.rejects(
    () => decodeHeicBytes(new Uint8Array(fakeHeic)),
    (err: unknown) => err instanceof ClientImagePrepError && err.code === 'heicDecodeFailed',
  );
});
