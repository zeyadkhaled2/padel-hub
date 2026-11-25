# Equipment photos

Implemented locally: create/select a photo draft, upload JPEG/PNG/WebP with local preview and upload progress, preview saved images in a 3-required / 4-maximum slot grid, and replace existing photos without losing previously saved assets.

## Simple flow

1. Verify the session and draft ownership/version.
2. Read at most 8 MiB; validate real image contents, dimensions and pixel count.
3. Resize to WebP display variants (320, 800 and 1600 px bounds), removing metadata. Original uploads are processed in memory, not stored.
4. Store immutable objects in the private `media-private` bucket, then atomically attach them to the draft (enforcing at most 4 attached photos for new additions, while allowing in-place replacement of an existing slot). A stale/conflicting save or failed upload leaves existing photos unchanged.
5. Serve owner previews, or exact approved/public listing attachments, through `/api/media/{id}`. Check visibility before and after retrieval; use no-store and verify stored bytes against the manifest. No signed/public Storage URLs or shared image optimization.

No processing queue, worker claims, leases or automatic retries. The pre-existing media_jobs table remains unused. Replacement does not delete previously saved images. Private objects left by interrupted or conflicting uploads are retained for manual review; no automatic cleanup claims. Already downloaded bytes cannot be revoked.

## Bounds

- **Per-listing photo count (all categories: rackets, balls, shoes, and bags):** **Minimum 3 photos** required before submission/approval; **maximum 4 photos** attached per listing.
  - Drafts may be saved with fewer than 3 photos (0, 1, or 2) so sellers can work incrementally.
  - Submitting a listing for review requires 3 to 4 attached photos across every equipment category.
  - Attempting to attach a 5th photo is rejected (`409` / `PT409`).
  - Replacing an existing photo preserves its slot without consuming an additional photo slot; failed replacements never destroy or detach the existing photo.
- **Legacy 5–6 photo compatibility (migration `20261125002500_photo_rules_and_seller_dashboard.sql`):**
  - Existing uploaded photos are never deleted or detached automatically, and `listing_media.sort_order` retains `0..5` compatibility for historical rows.
  - Already-published (`active`, `reserved`, `sold`, `traded`) listings that historically carried 5–6 photos continue displaying and serving all attached photos publicly and can transition cleanly through lifecycle actions (`sold`, `traded`, `archived`, `withdrawn`).
  - Pre-existing 5–6 photo drafts retain all attached photos across text edits and in-place replacements (including slots 4–5), reject adding further photos, and require 3–4 attached photos before new submission/re-approval.
- **File & abuse bounds:** 8 MiB input, 25 megapixels, dimensions 64–8000 px. Reject animations/unsupported formats. Extreme aspect ratios that resize below 64 px are rejected. Each server process handles at most two uploads concurrently; each user gets 20 attempts per ten minutes. A conservative 256 MiB retained processed-photo allowance per account prevents unbounded growth; review it against actual usage before launch. These are technical limits, not a paid plan or separate retailer entitlement.

## Run locally

Keep Supabase running, then:

```powershell
npm run check
node scripts/local-app.mjs serve
```

Open http://127.0.0.1:3100/en/account/photos (Arabic: `/ar/account/photos`). Create your profile first. The launcher creates/checks the private local bucket and passes local credentials in process memory; it does not edit `.env.local` or contact a hosted project. Only server code receives the service-role key.

In another terminal:

```powershell
node scripts/local-app.mjs test --workers=1
npm run test:db
```

This replaces the older account-only launcher when testing photos. Tests use synthetic accounts/images and leave them local. Hosted credentials, bucket policies and host body/time limits must be configured and verified before deployment. No production deployment is included.
