# Media Optimization V1 — Hosted Staging Migration & Deployment Runbook

> **Status:** Not yet applied to hosted infrastructure. Migration `027` has been applied and verified **locally only** (local Docker Supabase). Hosted staging (`padelhub-staging`, `sxghreukdkxclymysryp`, `eu-central-1`), production, and Vercel region configuration have **not** been modified and require explicit owner approval before execution.

---

## 1. Prerequisites (Owner Approval Required)

1. PR `feat(media): client-side image optimization, mobile upload queue and efficient public delivery` reviewed and approved.
2. Owner authorizes applying forward-only migration `027` to `padelhub-staging` (`sxghreukdkxclymysryp`).
3. Local staging environment variables configured in `.env.staging.local` (never committed) per [STAGING_SETUP.md](STAGING_SETUP.md).

## 2. Database Migration `027` (`padelhub-staging`)

Forward-only migration file:
- `supabase/migrations/20261125002700_photo_upload_idempotency.sql`

What migration `027` adds (zero edits to previously applied migrations `001`–`026`, zero destructive DDL):
- Table `private.photo_upload_idempotency` with `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` (`22/22` domain tables protected) and zero `anon`/`authenticated`/`PUBLIC` grants.
- Service-only RPC `public.get_photo_upload_receipt(p_owner, p_listing, p_upload_key)` (`SECURITY DEFINER`, `set search_path = ''`, executable only by `service_role`).
- Backwards-compatible optional trailing parameter `p_upload_key uuid default null` on `public.save_listing_photo(...)` (all existing 12-argument callers continue working identically).

### Execution Steps (Staging Only)

```powershell
# 1. Dry-run migration check against pinned padelhub-staging project ref:
node scripts/staging-app.mjs migrate-dry-run

# 2. Apply migration 027 to padelhub-staging:
node scripts/staging-app.mjs migrate
```

### Post-Migration Database Audit

Verify on `padelhub-staging`:
- `27/27` migrations recorded in `supabase_migrations.schema_migrations`.
- `22/22` tables in `public`/`private` have `relrowsecurity = true` and `relforcerowsecurity = true`.
- `0` direct table grants for `anon`, `authenticated`, or `PUBLIC`.
- `0` `ERROR`-level Supabase Security Advisors.

## 3. Application Build & Staging Smoke Verification

```powershell
# Build production app (automatically syncs unmodified LGPL-3.0 libheif-bundle.mjs to public/vendor/libheif/):
npm run check

# Prepare temporary staging smoke admin (follow STAGING_SETUP.md grant step):
node scripts/staging-app.mjs prepare-smoke-admin

# Start local production server connected to padelhub-staging (in terminal 1):
node scripts/staging-app.mjs serve

# Run full hosted staging smoke suite (in terminal 2):
node scripts/staging-app.mjs smoke
```

Confirm the updated smoke assertions pass on `padelhub-staging`:
- Direct upload `> 4,000,000` bytes (`4,000,001` B) rejected with HTTP `413`.
- Private owner photo preview returns `Cache-Control: private, no-store` with **no `ETag`**.
- Approved public `?listing=<uuid>` photo returns `Cache-Control: private, no-cache` + quoted SHA-256 `ETag`.
- Matching `If-None-Match` on `GET` and `HEAD` returns `304 Not Modified` without downloading Storage bytes.
- Withdrawing the listing immediately causes conditional `If-None-Match` with the prior `ETag` to return `404` with `Cache-Control: private, no-store` (never `304`).
- Revoke temporary smoke admin and verify `node scripts/staging-app.mjs verify-revoked-admin` passes with `active_admins = 0` and `visible_or_pending_listings = 0`.

## 4. Static Asset & LGPL-3.0 Deployment Check

On the deployed staging/preview URL, confirm HTTP `200` for:
- `/vendor/libheif/libheif-bundle.mjs` (generated during `npm install` / `npm run build` via `scripts/sync-heic-assets.mjs`)
- `/vendor/libheif/LICENSE.txt`
- `/licenses/libheif-js-NOTICE.txt`
- `/licenses/libheif-js-LICENSE.txt`
- `/en/about#open-source-notices` and `/ar/about#open-source-notices`

## 5. Optional Follow-Up: Vercel Function Region Colocation (Owner Approval Required)

Read-only header inspection of `https://padel-hub-beta.vercel.app/en` returned `X-Vercel-Id: fra1::iad1::...`:
- Edge pop: `fra1` (Frankfurt, close to Egypt)
- Serverless Functions: **`iad1` (US East)**
- Hosted Supabase (`padelhub-staging`): **`eu-central-1` (Frankfurt)**

Because every photo upload and `/api/media/[mediaId]` database authorization RPC crosses from `iad1` to `eu-central-1` and back, colocating Vercel Functions to `fra1` (supported as a single configurable region on Vercel Hobby via `"regions": ["fra1"]` in `vercel.json`) will remove ~160–220 ms of transatlantic RTT per request. Do **not** change `vercel.json` until explicitly authorized by the owner.

## 6. Production Deployment Guardrails

- Do **not** deploy to production until:
  1. Hosted staging migration `027` + smoke checks pass.
  2. Physical-device testing checklist ([MEDIA_PHYSICAL_DEVICE_CHECKLIST.md](MEDIA_PHYSICAL_DEVICE_CHECKLIST.md)) is signed off on real iPhone and Android devices.
  3. Production environment, custom transactional SMTP, and backups/restore drill are approved separately.
