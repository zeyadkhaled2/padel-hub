# Equipment photos

Implemented locally and verified end-to-end: **Option B (client-side image optimization + authoritative server-side Sharp processing)** with a multi-photo sequential seller queue, bounded upload idempotency, HEIC/HEIF mobile compatibility, and anonymous public-first ETag delivery.

## Upload lifecycle

1. **Multi-photo selection (up to 4 slots):** Sellers select 1–4 photos at once in `/[locale]/account/photos` (JPEG, PNG, WebP, HEIC, or HEIF). Selection is capped to remaining available listing slots (or 1 photo in replacement mode).
2. **Client-side preparation (`src/features/photos/client/`):** Enforces strictly **one photo at a time** via a dedicated single-flight `PreparationScheduler` (`prep-scheduler.ts`) plus worker-level serialization (`prepare-image.ts`, Web Worker + `OffscreenCanvas` with main-thread `createImageBitmap` / `HTMLImageElement` + `<canvas>` fallback) so file selection, upload start, cancellation, and retries can never decode two large photos concurrently:
   - Validates source file safety bounds (**<= 50 MB**, **64–12,000 px** per side, **<= 65 MP** decoded pixels — supporting 48 MP iPhone `8064×6048` photos without hitting the server upload cap).
   - Inspects actual magic bytes (JPEG, PNG, WebP, HEIC/HEIF), animation flags (rejecting GIF/APNG/animated WebP), EXIF orientation, alpha channel, and header dimensions.
   - **Pass-through skip:** Upright, non-animated JPEG/PNG/WebP originals already `<= 2000 px` and `<= 1,000,000` bytes skip client re-encoding completely to avoid generational loss.
   - **HEIC/HEIF decoding (standalone LGPL-3.0 distribution):** Attempts native browser decoding first (iOS Safari / macOS Safari — 0 extra JS downloaded). On browsers without native HEIC decoding (Chrome, Android Chrome, Edge, Firefox), dynamically imports the **unmodified standalone** ES module `/vendor/libheif/libheif-bundle.mjs` (staged from `libheif-js@1.23.5` by `scripts/sync-heic-assets.mjs`, not bundled into app Webpack chunks, `0 B` initial JS), validates dimensions before pixel allocation, decodes real HEVC/H.265 frames, and frees WASM handles immediately. Verbatim LGPL-3.0/GPL-3.0 notices and license texts are served at `/licenses/libheif-js-NOTICE.txt`, `/licenses/libheif-js-LICENSE.txt`, and `/vendor/libheif/LICENSE.txt` and linked from the site footer and `/[locale]/about#open-source-notices` (see `THIRD_PARTY_NOTICES.md`).
   - **Adaptive compression:** Normalizes EXIF orientation without double rotation, uses decode-time resizing when supported, preserves aspect ratio without enlarging, composites transparent images onto white only when falling back to JPEG, and encodes WebP (or JPEG fallback) starting at **2000 px / quality 0.90**, gently stepping down only if needed to target `<= 1 MB` and guarantee **<= 4,000,000 bytes** (safely below Vercel's standard 4.5 MB request-body limit).
   - **Local previews & memory cleanup:** Renders previews from optimized blobs, drops original `File` references once prepared, resets canvas dimensions (`0×0`), closes `ImageBitmap`s, revokes `ObjectURL`s, and terminates workers on cancel/unmount (checking exact worker identity so a stale abort never kills a newer worker). Never stores photos in `localStorage`.
3. **Sequential resilient upload queue (`PhotoForm` + `queue-controller.ts` + `upload-transport.ts`):**
   - Sends one prepared photo at a time using the latest confirmed `X-Listing-Version`, a per-item UUID `X-Upload-Key`, and any bound `replaceTargetId` (preserving replacement targets across cancellations and retries).
   - Uses a single per-attempt `AbortController` across pre-retry reconciliation, XHR upload, post-failure reconciliation, and retry backoff delays so clicking **Cancel** at any stage immediately halts work and prevents further automatic requests.
   - Preserves optimized blobs and local thumbnails on cancelled uploads so clicking **Retry** works seamlessly.
   - Distinguishes validation errors, HTTP `413` (including non-JSON hosting responses like Vercel `FUNCTION_PAYLOAD_TOO_LARGE`), `429` rate limits (enforcing live `Retry-After` cooldowns on both batch and individual Retry buttons), `409` optimistic concurrency conflicts (blocking both batch and individual Retry buttons until explicit **Reload draft** reconciliation succeeds), and ambiguous network/timeout/5xx failures.
   - **Ambiguous-response reconciliation & bounded idempotency (migration `027`):** Treats both ambiguous failures AND cancelled in-flight uploads (including replacements) as potentially committed on the server. Before retrying, the client queries `GET /api/listings/{id}/photos?uploadKey=...` to reconcile authoritative server listing state and `private.photo_upload_idempotency`. Already-committed uploads advance cleanly to `saved` with zero duplicate `POST`s, zero duplicate attachments, and zero repeated replacements. Previously saved photos always remain intact; unsaved local items remain retryable in memory until page reload/close.
4. **Authoritative server-side Sharp processing (`src/features/photos/processing.ts`, `handlers.ts`, `server.ts`):**
   - Independently enforces same-origin, verified non-recovery session (`verifiedUserClient()`), listing ownership/version/slot rules, **4,000,000-byte** incoming body cap, **concurrency reservation (`maxConcurrent = 2`) BEFORE consuming the DB upload rate limit** (so saturation `503` never burns seller quota), actual-byte validation, `64–8000 px` / `<= 25 MP` / `pages === 1` checks, and Sharp 10s timeouts. Never trusts client MIME, dimensions, or compression claims.
   - Single authoritative decode + `.rotate()` + `.toColorspace('srgb')` to the `1600 px` full bound, then bounded-parallel WebP (`quality: 80`, metadata/EXIF stripped) generation for all three variants (`thumb: 320`, `card: 800`, `full: 1600`).
   - Bounded-parallel immutable upload (`upsert: false`) to private `media-private` Storage, followed by atomic `public.save_listing_photo(..., p_upload_key)` attachment. Raw originals are never permanently stored; saved or historical assets are never automatically deleted.

## Delivery & ETag revalidation (`/api/media/[mediaId]` and `/api/admin/listings/[id]/photos/[media]`)

1. **Approved public photos (`?listing=<uuid>`):**
   - Checks anonymous public eligibility FIRST via `get_photo_delivery(asset, null, listing)` — performing **zero** user authentication calls (`verifiedUserClient`, `auth.getUser`, or MFA).
   - Fails closed (`503 private, no-store`) on DB/service errors without falling back to authenticated access.
   - Uses the selected variant's SHA-256 hash as a strong `ETag: "<sha256>"` with **`Cache-Control: private, no-cache`** (browser revalidation required on every reuse; **no** shared CDN caching, no `public`, no `s-maxage`, no `stale-while-revalidate`).
   - Matching `If-None-Match` on `GET`/`HEAD` returns **`304 Not Modified`** after fresh DB eligibility verification without downloading Storage bytes.
   - Full `200` responses download and SHA-256-verify Storage bytes and re-check anonymous public eligibility + manifest identity after download.
   - Once a listing becomes ineligible (withdrawn, archived, suspended, private, rejected, or edited), subsequent requests — including conditional requests with a prior `ETag` — return **`404` with `Cache-Control: private, no-store`** (never `304`). Previously downloaded copies cannot be retroactively revoked.
2. **Private owner previews & MFA-admin review photos:**
   - Require `verifiedUserClient()` (blocking unfinished recovery sessions; admin review additionally enforces active role + `aal2` MFA in Postgres).
   - Always return **`Cache-Control: private, no-store`** with **no `ETag`** and **never `304`**.

## Bounds

- **Per-listing photo count (all categories):** **Minimum 3 photos** required before submission/approval; **maximum 4 photos** attached per listing. Drafts may save with 0–2 photos. Legacy 5–6 photo listings remain preserved safely without automatic deletion; **Remove from draft** (`detach_listing_photo`) detaches links while keeping Storage objects privately preserved, and **Return to draft to edit** (`change_listing_status(..., 'reopen')`) allows older sold/traded/archived listings with `<3` or `>4` photos to adjust before resubmission.
- **Client source bounds:** `<= 50 MB` original file, `64–12,000 px` per side, `<= 65 MP` decoded pixels.
- **Outgoing & server upload bounds:** `<= 4,000,000` bytes incoming request body (aligned below Vercel's 4.5 MB standard limit), server Sharp `64–8000 px` / `<= 25 MP` / still JPEG/PNG/WebP only, `maxConcurrent = 2` per process, 20 upload attempts per 10 minutes per user, `<= 8 MiB` combined stored WebP variants per photo, 256 MiB retained processed-photo allowance per account.

## Observability & Supabase Free tier capacity

Privacy-safe structured server telemetry (`src/features/photos/telemetry.ts`) records strictly numeric/enum upload and delivery metrics (original/outgoing/stored bytes, prep/read/Sharp/Storage/DB durations, failure categories, HEIC fallback usage, conditional 304 vs. full responses, public vs. authenticated access paths) with zero filenames, raw bytes, EXIF, storage keys, tokens, or personal data.

Using measured stored WebP totals across representative scenes (**~0.30 MB/photo typical** across `thumb + card + full`; **~0.54 MB/photo conservative high-detail mix**) with `3.6–4.0` photos/listing plus `25%` historical replacement/detach retention headroom (`4.5–5.0` retained assets/listing -> **~1.35–2.70 MB/listing**):

| Listings | Typical Storage (1.35 MB/listing) | % of 1 GB Free | Conservative High-Detail (2.70 MB/listing) | % of 1 GB Free |
|---:|---:|---:|---:|---:|
| 20 | 27 MB | 2.6% | 54 MB | 5.3% |
| 100 | 135 MB | 13.2% | 270 MB | 26.4% |
| 200 | 270 MB | 26.4% | 540 MB | 52.7% |
| 500 | 675 MB | 65.9% | 1,350 MB | 131.8% |
| 800 | 1,080 MB | 105.5% | 2,160 MB | 210.9% |
| 1,000 | 1,350 MB | 131.8% | 2,700 MB | 263.7% |

- **Seller capacity within 1 GB Free Storage (70% warning = 717 MB):**
  - Sellers averaging **10 listings**: **26–53 sellers** before 70% alert (**37–75 sellers** hard cap).
  - Sellers averaging **20 listings**: **13–26 sellers** before 70% alert (**18–37 sellers** hard cap).
- **Monthly uncached Storage egress (24 `card` images per marketplace browse view vs. Supabase Free 5 GB/month uncached allowance; 10 GB total = 5 GB cached + 5 GB uncached; ~45 KB typical / ~95 KB high-detail card):**
  - **1,000 views:** `1.03–2.17 GB` (0% cache hit) → `0.31–0.65 GB` (70% 304 hit rate) → `0.15–0.33 GB` (85%).
  - **3,000 views:** `3.09–6.52 GB` (0%) → `0.93–1.96 GB` (70%) → `0.46–0.98 GB` (85%).
  - **5,000 views:** `5.15–10.87 GB` (0%) → `1.54–3.26 GB` (70%) → `0.77–1.63 GB` (85%).
  - **10,000 views:** `10.30–21.74 GB` (0%) → `3.09–6.52 GB` (70%) → `1.54–3.26 GB` (85%).
  - Note: Product detail `full` variant views add extra uncached egress on first load; client upload compression reduces mobile upload bandwidth, **not** permanent Storage size.
- **Region colocation finding:** Verified `padel-hub-beta.vercel.app` currently executes Serverless Functions in **`iad1`** (US East) behind `fra1` Edge (`X-Vercel-Id: fra1::iad1::...`), while `padelhub-staging` Supabase runs in **`eu-central-1`** (Frankfurt). Colocating Vercel Functions to **`fra1`** (single Hobby region, subject to owner approval — not modified in this PR) would eliminate transatlantic RTT between Next.js and Supabase DB/Storage.
- **Separate checklists:** See [MEDIA_PHYSICAL_DEVICE_CHECKLIST.md](MEDIA_PHYSICAL_DEVICE_CHECKLIST.md) for physical iPhone/Android/Safari/Firefox manual verification and [MEDIA_STAGING_MIGRATION_RUNBOOK.md](MEDIA_STAGING_MIGRATION_RUNBOOK.md) for owner-approved hosted staging migration `027` steps.

## Run locally

Keep local Supabase Docker running, apply local migrations through `027`, then:

```powershell
npm run check
node scripts/local-app.mjs serve
```

In another terminal:

```powershell
npm run test:unit
npm run test:db
node scripts/local-app.mjs test --workers=1
```
