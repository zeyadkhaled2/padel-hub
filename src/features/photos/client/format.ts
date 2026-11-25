import {
  CLIENT_IMAGE_LIMITS,
  type ClientOutputMime,
  type ClientSourceFormat,
} from './constants';

export type DetectedFormat = ClientSourceFormat | 'gif' | 'unknown';

export type ImageHeaderInspection = {
  format: DetectedFormat;
  isAnimated: boolean;
  hasAlpha: boolean;
  /** EXIF orientation 1..8 (1 = normal / upright). */
  orientation: number;
  /** Raw unoriented width/height if readable from file headers without full decode. */
  rawWidth: number | null;
  rawHeight: number | null;
  /** Display-oriented width/height after applying EXIF orientation swap (5..8). */
  orientedWidth: number | null;
  orientedHeight: number | null;
};

const HEIF_BRANDS = new Set([
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'hevm',
  'hevs',
  'mif1',
  'msf1',
]);

function readAscii(bytes: Uint8Array, start: number, length: number): string {
  if (start < 0 || start + length > bytes.length) return '';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += String.fromCharCode(bytes[start + i]);
  }
  return out;
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) >>> 0) +
    ((bytes[offset + 1] << 16) >>> 0) +
    ((bytes[offset + 2] << 8) >>> 0) +
    bytes[offset + 3]
  );
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] +
    (bytes[offset + 1] << 8) +
    (bytes[offset + 2] << 16) +
    ((bytes[offset + 3] << 24) >>> 0)
  );
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

export function isSwappedOrientation(orientation: number): boolean {
  return orientation >= 5 && orientation <= 8;
}

export function formatToMime(format: 'jpeg' | 'png' | 'webp'): ClientOutputMime {
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'png') return 'image/png';
  return 'image/webp';
}

function parseExifOrientationFromTiff(bytes: Uint8Array, tiffStart: number, end: number): number {
  if (tiffStart + 8 > end) return 1;
  const byteOrder = readAscii(bytes, tiffStart, 2);
  const littleEndian = byteOrder === 'II';
  if (!littleEndian && byteOrder !== 'MM') return 1;

  const readU16 = (pos: number) =>
    littleEndian ? readUint16LE(bytes, pos) : readUint16BE(bytes, pos);
  const readU32 = (pos: number) =>
    littleEndian ? readUint32LE(bytes, pos) : readUint32BE(bytes, pos);

  if (readU16(tiffStart + 2) !== 42) return 1;
  const ifd0Offset = readU32(tiffStart + 4);
  const ifdStart = tiffStart + ifd0Offset;
  if (ifdStart + 2 > end) return 1;

  const entryCount = readU16(ifdStart);
  for (let i = 0; i < entryCount; i++) {
    const entry = ifdStart + 2 + i * 12;
    if (entry + 12 > end) break;
    const tag = readU16(entry);
    if (tag === 0x0112) {
      const value = readU16(entry + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

function inspectJpeg(bytes: Uint8Array): ImageHeaderInspection {
  let offset = 2;
  let orientation = 1;
  let rawWidth: number | null = null;
  let rawHeight: number | null = null;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) {
      offset++;
    }
    if (offset >= bytes.length) break;
    const marker = bytes[offset++];

    // Standalone markers without length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    // EOI or SOS (compressed image data starts here).
    if (marker === 0xd9 || marker === 0xda) {
      break;
    }
    if (offset + 2 > bytes.length) break;
    const segmentLength = readUint16BE(bytes, offset);
    if (segmentLength < 2) break;
    const segmentStart = offset + 2;
    const segmentEnd = Math.min(bytes.length, offset + segmentLength);

    // APP1 EXIF orientation.
    if (
      marker === 0xe1 &&
      orientation === 1 &&
      segmentStart + 6 <= segmentEnd &&
      readAscii(bytes, segmentStart, 6) === 'Exif\0\0'
    ) {
      orientation = parseExifOrientationFromTiff(bytes, segmentStart + 6, segmentEnd);
    }

    // Start of Frame (SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15).
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof && segmentStart + 5 <= segmentEnd && rawWidth === null) {
      rawHeight = readUint16BE(bytes, segmentStart + 1);
      rawWidth = readUint16BE(bytes, segmentStart + 3);
    }

    if (rawWidth !== null && orientation !== 1) {
      // Found both dimensions and non-default orientation; can stop early.
      break;
    }
    offset += segmentLength;
  }

  const swapped = isSwappedOrientation(orientation);
  return {
    format: 'jpeg',
    isAnimated: false,
    hasAlpha: false,
    orientation,
    rawWidth,
    rawHeight,
    orientedWidth: rawWidth !== null && rawHeight !== null ? (swapped ? rawHeight : rawWidth) : null,
    orientedHeight: rawWidth !== null && rawHeight !== null ? (swapped ? rawWidth : rawHeight) : null,
  };
}

function inspectPng(bytes: Uint8Array): ImageHeaderInspection {
  let rawWidth: number | null = null;
  let rawHeight: number | null = null;
  let hasAlpha = false;
  let isAnimated = false;
  let orientation = 1;

  if (bytes.length >= 26 && readAscii(bytes, 12, 4) === 'IHDR') {
    rawWidth = readUint32BE(bytes, 16);
    rawHeight = readUint32BE(bytes, 20);
    const colorType = bytes[25];
    hasAlpha = colorType === 4 || colorType === 6;
  }

  // Walk PNG chunks up to IDAT to detect APNG (acTL), palette transparency (tRNS), or eXIf.
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const chunkLength = readUint32BE(bytes, offset);
    const chunkType = readAscii(bytes, offset + 4, 4);
    const dataStart = offset + 8;
    const dataEnd = Math.min(bytes.length, dataStart + chunkLength);

    if (chunkType === 'acTL') {
      isAnimated = true;
    } else if (chunkType === 'tRNS') {
      hasAlpha = true;
    } else if (chunkType === 'eXIf' && dataStart + 8 <= dataEnd) {
      orientation = parseExifOrientationFromTiff(bytes, dataStart, dataEnd);
    } else if (chunkType === 'IDAT' || chunkType === 'IEND') {
      break;
    }

    const nextOffset = offset + 12 + chunkLength;
    if (nextOffset <= offset || nextOffset > bytes.length) break;
    offset = nextOffset;
  }

  const swapped = isSwappedOrientation(orientation);
  return {
    format: 'png',
    isAnimated,
    hasAlpha,
    orientation,
    rawWidth,
    rawHeight,
    orientedWidth: rawWidth !== null && rawHeight !== null ? (swapped ? rawHeight : rawWidth) : null,
    orientedHeight: rawWidth !== null && rawHeight !== null ? (swapped ? rawWidth : rawHeight) : null,
  };
}

function inspectWebp(bytes: Uint8Array): ImageHeaderInspection {
  let rawWidth: number | null = null;
  let rawHeight: number | null = null;
  let hasAlpha = false;
  let isAnimated = false;
  let orientation = 1;

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const fourCC = readAscii(bytes, offset, 4);
    const chunkSize = readUint32LE(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = Math.min(bytes.length, dataStart + chunkSize);

    if (fourCC === 'VP8X' && dataStart + 10 <= dataEnd) {
      const flags = bytes[dataStart];
      isAnimated = (flags & 0x02) !== 0;
      hasAlpha = (flags & 0x10) !== 0;
      rawWidth = 1 + readUint24LE(bytes, dataStart + 4);
      rawHeight = 1 + readUint24LE(bytes, dataStart + 7);
    } else if (fourCC === 'VP8 ' && rawWidth === null && dataStart + 10 <= dataEnd) {
      // Lossy keyframe signature 0x9d 0x01 0x2a at bytes 3..5.
      if (bytes[dataStart + 3] === 0x9d && bytes[dataStart + 4] === 0x01 && bytes[dataStart + 5] === 0x2a) {
        rawWidth = readUint16LE(bytes, dataStart + 6) & 0x3fff;
        rawHeight = readUint16LE(bytes, dataStart + 8) & 0x3fff;
      }
    } else if (fourCC === 'VP8L' && rawWidth === null && dataStart + 5 <= dataEnd) {
      if (bytes[dataStart] === 0x2f) {
        const bits = readUint32LE(bytes, dataStart + 1);
        rawWidth = (bits & 0x3fff) + 1;
        rawHeight = ((bits >>> 14) & 0x3fff) + 1;
        hasAlpha = ((bits >>> 28) & 0x01) !== 0;
      }
    } else if (fourCC === 'EXIF' && dataStart + 8 <= dataEnd) {
      const hasExifPrefix = readAscii(bytes, dataStart, 6) === 'Exif\0\0';
      orientation = parseExifOrientationFromTiff(
        bytes,
        hasExifPrefix ? dataStart + 6 : dataStart,
        dataEnd,
      );
    }

    // RIFF chunks are padded to even byte boundaries.
    const paddedSize = chunkSize + (chunkSize & 1);
    const nextOffset = dataStart + paddedSize;
    if (nextOffset <= offset || nextOffset > bytes.length) break;
    offset = nextOffset;
  }

  const swapped = isSwappedOrientation(orientation);
  return {
    format: 'webp',
    isAnimated,
    hasAlpha,
    orientation,
    rawWidth,
    rawHeight,
    orientedWidth: rawWidth !== null && rawHeight !== null ? (swapped ? rawHeight : rawWidth) : null,
    orientedHeight: rawWidth !== null && rawHeight !== null ? (swapped ? rawWidth : rawHeight) : null,
  };
}

function isHeifFtypBox(bytes: Uint8Array): boolean {
  if (bytes.length < 16 || readAscii(bytes, 4, 4) !== 'ftyp') return false;
  const boxSize = Math.min(bytes.length, readUint32BE(bytes, 0));
  if (boxSize < 16) return false;
  const majorBrand = readAscii(bytes, 8, 4).toLowerCase();
  if (HEIF_BRANDS.has(majorBrand)) return true;

  // Check compatible brands (starting at offset 16, 4 bytes each).
  for (let pos = 16; pos + 4 <= boxSize; pos += 4) {
    const brand = readAscii(bytes, pos, 4).toLowerCase();
    if (HEIF_BRANDS.has(brand)) return true;
  }
  return false;
}

/**
 * Inspects actual magic bytes (never trusting browser-reported MIME type or file extension)
 * to identify supported source formats, animation flags, EXIF orientation, alpha, and header dimensions.
 */
export function inspectImageHeader(bytes: Uint8Array): ImageHeaderInspection {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return inspectJpeg(bytes);
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return inspectPng(bytes);
  }

  if (
    bytes.length >= 12 &&
    readAscii(bytes, 0, 4) === 'RIFF' &&
    readAscii(bytes, 8, 4) === 'WEBP'
  ) {
    return inspectWebp(bytes);
  }

  if (
    bytes.length >= 6 &&
    (readAscii(bytes, 0, 6) === 'GIF87a' || readAscii(bytes, 0, 6) === 'GIF89a')
  ) {
    return {
      format: 'gif',
      isAnimated: true,
      hasAlpha: true,
      orientation: 1,
      rawWidth: null,
      rawHeight: null,
      orientedWidth: null,
      orientedHeight: null,
    };
  }

  if (isHeifFtypBox(bytes)) {
    return {
      format: 'heic',
      isAnimated: false,
      hasAlpha: false,
      orientation: 1,
      rawWidth: null,
      rawHeight: null,
      orientedWidth: null,
      orientedHeight: null,
    };
  }

  return {
    format: 'unknown',
    isAnimated: false,
    hasAlpha: false,
    orientation: 1,
    rawWidth: null,
    rawHeight: null,
    orientedWidth: null,
    orientedHeight: null,
  };
}

/**
 * Computes aspect-ratio-preserving target dimensions inside a bounding box without enlarging.
 */
export function computeResizedDimensions(
  width: number,
  height: number,
  maxLongestEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxLongestEdge) {
    return { width, height };
  }
  const scale = maxLongestEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function validateClientSourceDimensions(width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  if (width < CLIENT_IMAGE_LIMITS.minDimension || height < CLIENT_IMAGE_LIMITS.minDimension) {
    return false;
  }
  if (
    width > CLIENT_IMAGE_LIMITS.maxSourceDimension ||
    height > CLIENT_IMAGE_LIMITS.maxSourceDimension
  ) {
    return false;
  }
  if (width * height > CLIENT_IMAGE_LIMITS.maxDecodedPixels) {
    return false;
  }
  // Reject extreme panoramic aspect ratios that would collapse below the server's
  // 64 px minimum when resized to the authoritative 1600 px full variant.
  const fullDims = computeResizedDimensions(width, height, CLIENT_IMAGE_LIMITS.serverFullBound);
  if (
    fullDims.width < CLIENT_IMAGE_LIMITS.minDimension ||
    fullDims.height < CLIENT_IMAGE_LIMITS.minDimension
  ) {
    return false;
  }
  return true;
}

/**
 * Returns true when an already-suitable JPEG, PNG, or WebP can be uploaded directly to the
 * authoritative server Sharp pipeline without unnecessary client re-encoding (preventing
 * generational quality loss).
 */
export function canPassthroughOriginal(
  inspection: ImageHeaderInspection,
  fileSize: number,
): inspection is ImageHeaderInspection & {
  format: 'jpeg' | 'png' | 'webp';
  orientedWidth: number;
  orientedHeight: number;
} {
  if (
    inspection.format !== 'jpeg' &&
    inspection.format !== 'png' &&
    inspection.format !== 'webp'
  ) {
    return false;
  }
  if (inspection.isAnimated) return false;
  if (inspection.orientation !== 1) return false;
  if (fileSize < 1 || fileSize > CLIENT_IMAGE_LIMITS.passthroughMaxBytes) return false;
  if (inspection.orientedWidth === null || inspection.orientedHeight === null) return false;

  const w = inspection.orientedWidth;
  const h = inspection.orientedHeight;
  if (!validateClientSourceDimensions(w, h)) return false;
  if (Math.max(w, h) > CLIENT_IMAGE_LIMITS.maxOutputDimension) return false;
  if (w * h > CLIENT_IMAGE_LIMITS.serverMaxPixels) return false;

  return true;
}

/**
 * Returns true if an original file may safely be uploaded as a fallback when browser Canvas/Worker
 * optimization unexpectedly fails. Never allows HEIC, animated files, oversized payloads (>4 MB),
 * or images exceeding server input bounds.
 */
export function canFallbackToOriginalOnPrepFailure(
  inspection: ImageHeaderInspection,
  fileSize: number,
): boolean {
  if (
    inspection.format !== 'jpeg' &&
    inspection.format !== 'png' &&
    inspection.format !== 'webp'
  ) {
    return false;
  }
  if (inspection.isAnimated) return false;
  if (fileSize < 1 || fileSize > CLIENT_IMAGE_LIMITS.hardMaxUploadBytes) return false;

  if (inspection.orientedWidth !== null && inspection.orientedHeight !== null) {
    const w = inspection.orientedWidth;
    const h = inspection.orientedHeight;
    if (
      w < CLIENT_IMAGE_LIMITS.minDimension ||
      h < CLIENT_IMAGE_LIMITS.minDimension ||
      w > CLIENT_IMAGE_LIMITS.serverMaxDimension ||
      h > CLIENT_IMAGE_LIMITS.serverMaxDimension ||
      w * h > CLIENT_IMAGE_LIMITS.serverMaxPixels
    ) {
      return false;
    }
    const fullDims = computeResizedDimensions(w, h, CLIENT_IMAGE_LIMITS.serverFullBound);
    if (
      fullDims.width < CLIENT_IMAGE_LIMITS.minDimension ||
      fullDims.height < CLIENT_IMAGE_LIMITS.minDimension
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Checks whether a re-encoded output should be replaced by the untouched original
 * (e.g., if an already-compressed JPEG/WebP grew larger upon re-encoding while staying
 * within orientation, dimension, and size bounds).
 */
export function shouldPreferOriginalOverReencoded(params: {
  inspection: ImageHeaderInspection;
  originalBytes: number;
  encodedBytes: number;
}): boolean {
  const { inspection, originalBytes, encodedBytes } = params;
  if (encodedBytes < originalBytes) return false;
  if (
    inspection.format !== 'jpeg' &&
    inspection.format !== 'png' &&
    inspection.format !== 'webp'
  ) {
    return false;
  }
  if (inspection.isAnimated || inspection.orientation !== 1) return false;
  if (originalBytes > CLIENT_IMAGE_LIMITS.hardMaxUploadBytes) return false;
  if (inspection.orientedWidth === null || inspection.orientedHeight === null) return false;
  return (
    Math.max(inspection.orientedWidth, inspection.orientedHeight) <=
      CLIENT_IMAGE_LIMITS.maxOutputDimension &&
    inspection.orientedWidth * inspection.orientedHeight <= CLIENT_IMAGE_LIMITS.serverMaxPixels
  );
}
