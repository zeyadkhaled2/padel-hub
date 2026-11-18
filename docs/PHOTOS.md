# Equipment photos

Implemented locally: create/select a photo draft, upload JPEG/PNG/WebP, preview saved images and replace a photo. The full listing editor and dashboard are separate next steps.

## Simple flow

1. Verify the session and draft ownership/version.
2. Read at most 8 MiB; validate real image contents, dimensions and pixel count.
3. Resize to WebP display variants (320, 800 and 1600 px bounds), removing metadata. Original uploads are processed in memory, not stored.
4. Store immutable objects in the private `media-private` bucket, then atomically attach them to the draft. A stale/conflicting save leaves existing photos unchanged.
5. Serve owner previews, or exact approved/public listing attachments, through `/api/media/{id}`. Check visibility before and after retrieval; use no-store and verify stored bytes against the manifest. No signed/public Storage URLs or shared image optimization.

No processing queue, worker claims, leases or automatic retries. The pre-existing media_jobs table remains unused. Replacement does not delete previously saved images. Private objects left by interrupted or conflicting uploads are retained for manual review; no automatic cleanup claims. Already downloaded bytes cannot be revoked.

## Bounds

Six attached photos per listing; 8 MiB input, 25 megapixels, dimensions 64–8000 px. Reject animations/unsupported formats. Extreme aspect ratios that resize below 64 px are rejected. Each server process handles at most two uploads concurrently; each user gets 20 attempts per ten minutes. A conservative 256 MiB retained processed-photo allowance per account prevents unbounded growth; review it against actual usage before launch. These are technical limits, not a paid plan or separate retailer entitlement.

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
