import {
  PHOTO_CLIENT_ERROR_CODES,
  type PhotoErrorCode,
  type PhotoReconcileResponse,
} from '../types';
import type { PreparedPhotoResult } from './constants';

export type UploadTransportResult =
  | {
      ok: true;
      id: string;
      version: number;
      media_ids?: string[];
      idempotent: boolean;
      storedBytes?: number;
      serverProcessingMs?: number;
    }
  | {
      ok: false;
      kind:
        | 'payload_too_large'
        | 'rate_limited'
        | 'conflict'
        | 'photo_limit'
        | 'auth'
        | 'validation'
        | 'ambiguous'
        | 'cancelled';
      code: PhotoErrorCode;
      status: number;
      retryAfterSeconds?: number | null;
    };

export function parseRetryAfterSeconds(raw: string | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isSafeInteger(seconds) && seconds > 0 ? Math.min(seconds, 3600) : null;
  }
  const timestamp = Date.parse(trimmed);
  if (!Number.isNaN(timestamp)) {
    const delta = Math.ceil((timestamp - Date.now()) / 1000);
    return delta > 0 ? Math.min(delta, 3600) : null;
  }
  return null;
}

export function classifyUploadHttpResponse(params: {
  status: number;
  responseText: string;
  retryAfterHeader: string | null;
}): UploadTransportResult {
  const { status, responseText, retryAfterHeader } = params;

  if (status === 201 || status === 200) {
    try {
      const parsed = JSON.parse(responseText) as {
        id?: unknown;
        version?: unknown;
        media_ids?: unknown;
        idempotent?: unknown;
        storedBytes?: unknown;
        serverProcessingMs?: unknown;
      };
      if (typeof parsed.id === 'string' && typeof parsed.version === 'number') {
        return {
          ok: true,
          id: parsed.id,
          version: parsed.version,
          media_ids: Array.isArray(parsed.media_ids)
            ? parsed.media_ids.filter((item): item is string => typeof item === 'string')
            : undefined,
          idempotent: parsed.idempotent === true || status === 200,
          storedBytes: typeof parsed.storedBytes === 'number' ? parsed.storedBytes : undefined,
          serverProcessingMs:
            typeof parsed.serverProcessingMs === 'number' ? parsed.serverProcessingMs : undefined,
        };
      }
    } catch {
      /* Treat unparseable 2xx as ambiguous so caller reconciles with server. */
    }
    return { ok: false, kind: 'ambiguous', code: 'unavailable', status };
  }

  // Handle HTTP 413 directly even when Vercel or an intermediary returns plain text / HTML.
  if (status === 413) {
    return {
      ok: false,
      kind: 'payload_too_large',
      code: 'payloadTooLarge',
      status: 413,
    };
  }

  let parsedCode: string | null = null;
  try {
    const json = JSON.parse(responseText) as { error?: unknown };
    if (typeof json.error === 'string') {
      parsedCode = json.error;
    }
  } catch {
    /* Intermediary/proxy non-JSON response. */
  }

  const safeCode: PhotoErrorCode =
    parsedCode && (PHOTO_CLIENT_ERROR_CODES as readonly string[]).includes(parsedCode)
      ? (parsedCode as PhotoErrorCode)
      : 'unavailable';

  if (status === 429 || safeCode === 'rateLimited') {
    return {
      ok: false,
      kind: 'rate_limited',
      code: 'rateLimited',
      status: 429,
      retryAfterSeconds: parseRetryAfterSeconds(retryAfterHeader),
    };
  }

  if (status === 409) {
    if (safeCode === 'photoLimit') {
      return { ok: false, kind: 'photo_limit', code: 'photoLimit', status: 409 };
    }
    return { ok: false, kind: 'conflict', code: 'conflict', status: 409 };
  }

  if (status === 401 || safeCode === 'signin') {
    return { ok: false, kind: 'auth', code: 'signin', status: 401 };
  }

  if (status >= 400 && status < 500) {
    return {
      ok: false,
      kind: 'validation',
      code: safeCode === 'unavailable' ? 'invalidFile' : safeCode,
      status,
    };
  }

  return {
    ok: false,
    kind: 'ambiguous',
    code: 'unavailable',
    status,
    retryAfterSeconds: parseRetryAfterSeconds(retryAfterHeader),
  };
}

export function sendPreparedPhotoUpload(params: {
  listingId: string;
  expectedVersion: number;
  uploadKey: string;
  replacePhotoId: string | null;
  prepared: PreparedPhotoResult;
  signal?: AbortSignal;
  onProgress?: (percent: number, phase: 'uploading' | 'saving') => void;
}): Promise<UploadTransportResult> {
  const {
    listingId,
    expectedVersion,
    uploadKey,
    replacePhotoId,
    prepared,
    signal,
    onProgress,
  } = params;

  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve({ ok: false, kind: 'cancelled', code: 'unavailable', status: 0 });
      return;
    }

    const xhr = new XMLHttpRequest();
    let settled = false;
    const finish = (result: UploadTransportResult) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', handleAbort);
      resolve(result);
    };

    const handleAbort = () => {
      xhr.abort();
      finish({ ok: false, kind: 'cancelled', code: 'unavailable', status: 0 });
    };
    signal?.addEventListener('abort', handleAbort, { once: true });

    xhr.open('POST', `/api/listings/${listingId}/photos`);
    xhr.timeout = 60_000;
    xhr.setRequestHeader('Content-Type', prepared.mimeType);
    xhr.setRequestHeader('X-Listing-Version', String(expectedVersion));
    xhr.setRequestHeader('X-Upload-Key', uploadKey);
    if (replacePhotoId) {
      xhr.setRequestHeader('X-Replace-Photo', replacePhotoId);
    }
    // Privacy-safe numeric/enum observability hints only (zero filenames or PII).
    xhr.setRequestHeader('X-Client-Original-Bytes', String(prepared.originalBytes));
    xhr.setRequestHeader('X-Client-Prep-Ms', String(prepared.durationMs));
    xhr.setRequestHeader('X-Client-Heic-Fallback', prepared.heicFallbackUsed ? '1' : '0');
    xhr.setRequestHeader('X-Client-Source-Format', prepared.sourceFormat);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      const pct = Math.min(100, Math.round((event.loaded / event.total) * 100));
      onProgress?.(pct, pct >= 100 ? 'saving' : 'uploading');
    };
    xhr.upload.onload = () => {
      onProgress?.(100, 'saving');
    };

    xhr.onload = () => {
      finish(
        classifyUploadHttpResponse({
          status: xhr.status,
          responseText: xhr.responseText ?? '',
          retryAfterHeader: xhr.getResponseHeader('Retry-After'),
        }),
      );
    };

    xhr.onerror = () => {
      finish({ ok: false, kind: 'ambiguous', code: 'unavailable', status: 0 });
    };
    xhr.ontimeout = () => {
      finish({ ok: false, kind: 'ambiguous', code: 'unavailable', status: 0 });
    };
    xhr.onabort = () => {
      finish({ ok: false, kind: 'cancelled', code: 'unavailable', status: 0 });
    };

    xhr.send(prepared.blob);
  });
}

export async function reconcileListingPhotoState(
  listingId: string,
  uploadKey?: string,
  signal?: AbortSignal,
): Promise<
  | { ok: true; data: PhotoReconcileResponse }
  | { ok: false; code: PhotoErrorCode; aborted?: boolean }
> {
  if (signal?.aborted) {
    return { ok: false, code: 'unavailable', aborted: true };
  }
  try {
    const query = uploadKey ? `?uploadKey=${encodeURIComponent(uploadKey)}` : '';
    const response = await fetch(`/api/listings/${listingId}/photos${query}`, {
      method: 'GET',
      cache: 'no-store',
      signal,
    });
    if (!response.ok) {
      if (response.status === 401) return { ok: false, code: 'signin' };
      if (response.status === 404) return { ok: false, code: 'notFound' };
      return { ok: false, code: 'unavailable' };
    }
    const data = (await response.json()) as PhotoReconcileResponse;
    if (
      typeof data.version !== 'number' ||
      !Array.isArray(data.media_ids) ||
      typeof data.status !== 'string'
    ) {
      return { ok: false, code: 'unavailable' };
    }
    return { ok: true, data };
  } catch (error) {
    const aborted =
      Boolean(signal?.aborted) ||
      (error instanceof Error && error.name === 'AbortError');
    return { ok: false, code: 'unavailable', aborted };
  }
}

export function generateUploadKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
