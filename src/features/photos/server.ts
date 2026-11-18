import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import sharp, { type Metadata } from 'sharp';
import { serverClient } from '@/server/supabase/server';
import { authConfig } from '@/server/supabase/config';

const MAX_BYTES = 8 * 1024 * 1024;
const BUCKET = 'media-private';
let inFlight = 0; // Bound memory in this Node process; no background queue.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const digest = (value: Buffer) => createHash('sha256').update(value).digest('hex');
type Variant = { key: string; bytes: number; sha256: string };
type Manifest = Record<'thumb' | 'card' | 'full', Variant>;

function storageClient() {
  const config = authConfig();
  const key = process.env.PADELHUB_SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !key) return null;
  return createClient(config.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(15000) }) },
  });
}

class PhotoError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}
async function boundedBody(stream: ReadableStream<Uint8Array> | null, max = MAX_BYTES) {
  if (!stream) throw new PhotoError('invalidFile', 400);
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; void reader.cancel(); }, 30000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) { if (timedOut) throw new PhotoError('unavailable', 503); break; }
      total += value.byteLength;
      if (total > max) { await reader.cancel(); throw new PhotoError('tooLarge', 413); }
      chunks.push(Buffer.from(value));
    }
  } finally { clearTimeout(timeout); reader.releaseLock(); }
  return Buffer.concat(chunks);
}
const failure = (code: string, status: number) => Response.json({ error: code }, { status, headers });

export async function uploadPhoto(request: Request, listing: string) {
  const config = authConfig();
  if (!config || request.headers.get('origin') !== config.origin) return failure('notAllowed', 403);
  if (!UUID.test(listing)) return failure('notFound', 404);
  const version = Number(request.headers.get('x-listing-version'));
  const replace = request.headers.get('x-replace-photo');
  if (!Number.isSafeInteger(version) || version < 1 || (replace && !UUID.test(replace))) return failure('invalidFile', 400);
  if (Number(request.headers.get('content-length')) > MAX_BYTES) return failure('tooLarge', 413);
  const client = await serverClient();
  const admin = storageClient();
  if (!client || !admin) return failure('unavailable', 503);
  const { data: { user } } = await client.auth.getUser();
  if (!user?.email_confirmed_at) return failure('signin', 401);
  const { data: draft, error: draftError } = await client.rpc('get_my_listing', { p_listing_id: listing });
  if (draftError || !draft) return failure('notFound', 404);
  if (draft.version !== version || !['draft', 'rejected'].includes(draft.status)) return failure('conflict', 409);
  if (replace ? !draft.media_ids.includes(replace) : draft.media_ids.length >= 6) return failure('photoLimit', 409);
  const { data: allowed, error: rateError } = await admin.rpc('consume_photo_upload', { p_owner: user.id });
  if (rateError) return failure('unavailable', 503);
  if (!allowed) return failure('rateLimited', 429);
  if (inFlight >= 2) return failure('unavailable', 503);
  inFlight++;
  try {
    const bytes = await boundedBody(request.body);
    let meta: Metadata;
    try { meta = await sharp(bytes, { limitInputPixels: 25000000, failOn: 'warning' }).metadata(); }
    catch { throw new PhotoError('invalidFile', 400); }
    if (!meta.width || !meta.height || meta.width < 64 || meta.height < 64 || meta.width > 8000 || meta.height > 8000 || (meta.pages ?? 1) !== 1 || !['jpeg', 'png', 'webp'].includes(meta.format)) throw new PhotoError('invalidFile', 400);
    const asset = randomUUID();
    const attempt = randomUUID();
    const manifest = {} as Manifest;
    const output: { key: string; bytes: Buffer }[] = [];
    let width = 0, height = 0;
    for (const [variant, size] of [['thumb', 320], ['card', 800], ['full', 1600]] as const) {
      // Default sharp output strips metadata. Never preserve originals/EXIF.
      const { data, info } = await sharp(bytes, { limitInputPixels: 25000000, failOn: 'warning' }).rotate().resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).timeout({ seconds: 10 }).toBuffer({ resolveWithObject: true });
      if (variant === 'full') { width = info.width; height = info.height; }
      const key = `processed/${asset}/${attempt}/${variant}.webp`;
      manifest[variant] = { key, bytes: data.length, sha256: digest(data) };
      output.push({ key, bytes: data });
    }
    const storedBytes = output.reduce((sum, item) => sum + item.bytes.length, 0);
    if (width < 64 || height < 64) throw new PhotoError('invalidFile', 400);
    if (storedBytes > MAX_BYTES) throw new PhotoError('tooLarge', 413);
    for (const item of output) {
      const { error } = await admin.storage.from(BUCKET).upload(item.key, item.bytes, { contentType: 'image/webp', upsert: false });
      if (error) throw new PhotoError('unavailable', 503);
    }
    const { data, error } = await admin.rpc('save_listing_photo', {
      p_owner: user.id, p_listing: listing, p_version: version, p_asset: asset, p_attempt: attempt,
      p_mime: `image/${meta.format}`, p_bytes: storedBytes, p_width: width, p_height: height,
      p_hash: manifest.full.sha256, p_manifest: manifest, p_replace: replace,
    });
    // Do not delete on ambiguous failure: the transaction may have committed.
    // Unattached private leftovers can be inspected manually; existing photos remain.
    if (error) throw new PhotoError(error.code === 'PT409' ? 'conflict' : 'unavailable', error.code === 'PT409' ? 409 : 503);
    return Response.json(data, { status: 201, headers });
  } catch (error) {
    return error instanceof PhotoError ? failure(error.code, error.status) : failure('unavailable', 503);
  } finally { inFlight--; }
}

export async function deliverPhoto(request: Request, asset: string) {
  if (!UUID.test(asset)) return failure('notFound', 404);
  const url = new URL(request.url);
  const listing = url.searchParams.get('listing');
  const variant = url.searchParams.get('variant') ?? 'card';
  if ((listing && !UUID.test(listing)) || !['thumb', 'card', 'full'].includes(variant)) return failure('notFound', 404);
  const admin = storageClient();
  const config = authConfig();
  if (!admin || !config) return failure('unavailable', 503);
  try {
    const client = await serverClient();
    const user = client ? (await client.auth.getUser()).data.user : null;
    const args = { p_asset: asset, p_viewer: user?.email_confirmed_at ? user.id : null, p_listing: listing };
    const first = await admin.rpc('get_photo_delivery', args);
    if (first.error) return failure('unavailable', 503);
    if (!first.data) return failure('notFound', 404);
    if (request.headers.has('range')) return failure('rangeUnsupported', 416);
    const selected = (first.data as Manifest)[variant as keyof Manifest];
    const object = await fetch(`${config.url}/storage/v1/object/authenticated/${BUCKET}/${selected.key}`, {
      headers: { apikey: process.env.PADELHUB_SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.PADELHUB_SUPABASE_SERVICE_ROLE_KEY!}` },
      cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    if (!object.ok) return failure('unavailable', 503);
    const bytes = await boundedBody(object.body);
    if (bytes.length !== selected.bytes || digest(bytes) !== selected.sha256) return failure('unavailable', 503);
    const second = await admin.rpc('get_photo_delivery', args);
    if (second.error) return failure('unavailable', 503);
    if (!second.data || JSON.stringify(second.data) !== JSON.stringify(first.data)) return failure('notFound', 404);
    return new Response(request.method === 'HEAD' ? null : new Uint8Array(bytes), { headers: { ...headers, 'Content-Type': 'image/webp', 'Content-Length': String(bytes.length) } });
  } catch { return failure('unavailable', 503); }
}
