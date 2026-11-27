# Application organization

One modular Next.js App Router application with TypeScript strict mode. No separate API service or monorepo is needed for the pilot.

```text
src/
  app/
    [locale]/
      about/page.tsx
      equipment/[id]/page.tsx
      sellers/[username]/page.tsx
      layout.tsx
      page.tsx
    globals.css
    icon.svg
  components/
    layout/
      brand.tsx
      preferences.tsx
      site-footer.tsx
      site-header.tsx
    providers/
      theme-provider.tsx
    sections/
      community-cta-section.tsx
      faq-section.tsx
      features-section.tsx
      hero-section.tsx
      how-it-works-section.tsx
      inspection-showcase.tsx
    ui/
      section-header.tsx
  features/
    marketplace/
      category-pills.tsx
      demo-data.ts
      equipment-art.tsx
      equipment-detail-view.tsx
      listing-card.tsx
      marketplace-page.tsx
      search-panel.tsx
      seller-profile-view.tsx
  i18n/
    navigation.ts
    request.ts
    routing.ts
  lib/
    format.ts
  proxy.ts
```

- `src/app/[locale]`: localized routes and thin page composition.
- `src/components/layout`: site-wide header, footer, brand mark, and locale/theme preference controls.
- `src/components/providers`: client context providers (`theme-provider.tsx`).
- `src/components/sections`: marketing and product education sections.
- `src/components/ui`: reusable presentational primitives (`section-header.tsx`).
- `src/features/marketplace`: equipment domain UI, explicitly typed demo fixtures, URL search/category filtering, and detail/seller views. Future production repository functions must be separate from fixtures.
- `src/lib`: shared formatting helpers (`format.ts`).
- `src/i18n` & `messages`: supported locales (`en`, `ar`), request messages, and localized navigation.
- `tests/e2e`: Playwright browser behavior tests (`foundation.spec.ts`).
- `docs`: canonical product, design, architecture, and live handoff documentation (`PROGRESS.md`, `PRODUCT_PLAN.md`, `DESIGN_SPEC.md`, `ARCHITECTURE.md`).

Add `src/server` for server-only integrations and `supabase/migrations` when database work starts. Do not introduce empty service/repository wrappers.

## Boundaries and deployment
Server-render routes and filter data on the server. Theme selection (`Preferences`) and the interactive disclosure showcase (`InspectionShowcase`) are small client islands. next-intl owns locale routing and message lookup. Tailwind v4 (`@theme inline`) and semantic CSS tokens in `src/app/globals.css` provide the shared visual vocabulary.

Use the supported Webpack bundler (`next dev --webpack` / `next build --webpack`). TypeScript 6.0.3 is pinned for lint-tool compatibility.

Frontend preview deployment is connected to GitHub `main` on Vercel (`padel-hub-beta.vercel.app`, `zeyadkhaled2s-projects` Hobby workspace) using `vercel.json` and `.vercelignore`. Keep `noindex` until demo inventory is replaced and the launch gates in `PRODUCT_PLAN.md` are met. No Supabase, Railway, or Resend resources are provisioned yet.

## Local accounts integration — 2026-11-17

- Thin localized `/auth/signin`, `/auth/signup`, `/auth/callback` and `/account` routes compose `src/features/auth` and `src/features/profile`.
- `src/server/supabase` owns server-only configuration, cookie-backed clients, session verification and refresh. Dedicated PADELHUB variables avoid falling back to an unrelated hosted environment. No service-role client is used by these account flows.
- Server Actions validate inputs and invoke owner RPCs under the user's verified session. Profile, username and contact saves remain separate atomic operations with expected versions; stale conflicts require explicit reload/review.
- Private account/auth responses are dynamic/no-store with noindex metadata. Demo marketplace data remains separate; account settings do not yet expose real public storefronts.
- `tests/e2e/account.spec.ts` exercises actual local Auth/Mailpit confirmation, account isolation, cookie refresh, form persistence and conflicts. See LOCAL_ACCOUNTS.md for setup; hosted auth and recovery remain future work.

## Equipment photos — current implementation

`src/features/photos` owns the synchronous image processing, draft photo page and controls; `src/app` contains thin routes. `scripts/local-app.mjs` provides repeatable local setup/start/test without changing `.env.local`. Validated photo variants are stored privately, then attached by a service-only transactional RPC after ownership/version checks. Browser clients cannot supply processed manifests. Public delivery requires an exact approved attachment and fresh eligibility checks; the optimizer only accepts fixed repository artwork. No background worker system is implemented. See PHOTOS.md.

## Listing editor

`src/features/listings` contains owner listing summaries, category-specific forms and authenticated Server Actions. Thin `/account/listings` routes use the existing draft/save/submit/withdraw RPCs; migration 008 adds only the owner summary query. Ownership and expected versions are checked in the database; stale forms retain input and require reload. Photo management remains in the existing photo page. Public browsing is implemented; a minimal admin review UI now exists; dashboard visual refinement remains.

## Public buyer journey

Migration 009 provides explicit public listing projections under a read-only capability. Browse, detail and contact share approved-content/media, profile visibility, account status and consent checks. Anonymous browse uses the publishable key; only the server contact redirect reads a consented phone number. No shared caching is used for inventory/contact or protected photos. `/demo` owns all illustrative inventory; the main marketplace never falls back to demo records. `/api/contact/[id]` creates only a fixed `https://wa.me/` destination and rechecks eligibility on each request. Public seller profiles and analytics remain unfinished.

## Admin review

`src/features/admin` owns MFA enrollment/challenge and the minimal queue/review UI. Migration 010 adds role/MFA access status, paginated pending summaries, authorized photo reads and owner rejection reasons. All decisions still use migration 005 snapshot/version checks. Admin photo delivery reuses the bounded, hash-verified private proxy; it rechecks the session-authorized RPC before returning bytes. No role provisioning endpoint is exposed. See ADMIN_REVIEW.md for operations and the UI refinement prompt.

## Seller lifecycle

Migration 011 adds `change_listing_status`: owner/version checks, offer-compatible sold/traded transitions, archive from active/pending, and atomic relist through the existing submission checks. Relisting requires fresh approval; failed submissions roll back status/version/audit changes. Existing public projections hide non-active inventory from search and block contact while retaining eligible sold/traded detail pages. No photo deletion or reservation controls.

## Public profile URLs

Thin `[locale]/[handle]` route accepts only `@username`; decoded parameters are validated. Locale-neutral shared links negotiate the visitor locale via next-intl. Migration 012 provides an anonymous safe projection, gated by public/active profile status, with approved-active inventory resolved through immutable seller identity. No auth ID or phone is returned. Rename execution is revoked for API roles; legacy alias tests grant permission only within disposable test scopes. Profile public IDs and existing aliases are preserved for a later rename/QR decision.

## QR and expanded equipment
Migration 013 resolves public profile IDs to usernames only while public/active. `/api/profiles/[id]` returns a temporary no-store redirect to locale-neutral `/@username`; malformed/private/suspended/missing targets return 404, backend failure 503. Client-side QR generation is lazy-loaded and downloads a PNG without storage or external services.
Migration 014 adds shoes/bags and numeric `shoe_size_eu`; submission requires valid shoe sizing, accessories are sale-only, and existing ownership/version/approval/media checks remain. Owner, moderation and public projections include size. No old migration was rewritten.

## Basic listing analytics
`src/features/analytics` owns the view tracker, best-effort recorder and owner/admin summary. Migration 016 stores daily counts in a private RLS-protected table. No visitor identifiers, IPs or raw browsing events are saved; older engagement scaffolding is unused. The service-only recording RPC checks current public eligibility; contact counts require active listings. The authenticated summary RPC restricts owners to their listing views only; migration 017 omits contact counts from owner responses. Marketplace totals, including WhatsApp clicks, require active admin role plus MFA.

Visible browser mounts send same-origin POSTs, deduplicated per listing/tab/UTC day using sessionStorage. WhatsApp GET redirects schedule writes with Next `after`; failures never change the destination response. Counts are approximate, may include bots/self-visits/repeated clicks and are not verified transactions. Totals cover today plus 29 previous UTC dates; no historical backfill or new analytics vendor. Frontend v2 remains separate pending Ziad's review request.

## Shoe-size search
Migration 018 replaces the search RPC signature with an optional trailing numeric size argument (old calls still work via defaults). It retains the same public visibility and pagination rules and matches shoes by exact EU size, validating 20–55 in half steps. The URL `size` parameter is parsed server-side and preserved in pagination/language links; non-shoe category shortcuts clear it. No new index or dependency is needed for the initial inventory.

## Phase 1 architecture refactor — 2026-11-20
- `src/lib/domain/equipment.ts` centralizes equipment categories, typed `CATEGORY_CONFIG` metadata (photo minimums, allowed offer types, swap support, shoe-size filter compatibility, category-specific fields), listing statuses, curated brands, governorates, and lifecycle predicates.
- `src/lib/validation/shared.ts` centralizes shared Zod schemas and parsers (UUIDs, positive versions, pagination, usernames, `@handle` decoding, E.164 WhatsApp numbers, EU shoe half-sizes, FormData string extraction).
- `src/lib/errors/domain.ts` provides a narrow Postgres SQLSTATE classifier (`classifyRpcError` -> `DomainErrorKind`) so feature actions map conflicts, limits, authorization denials, and validation errors to existing localized keys without exposing raw database details.
- `src/server/supabase/clients.ts` owns stateless anonymous (`anonClient`) and service-role (`serviceClient`) Supabase clients, eliminating cross-feature imports of `publicClient` from `src/features/marketplace/public-data.ts` and duplicate client construction in `src/features/photos/server.ts`.
- Domain features separate pure validation and RPC-boundary parsing (`validation.ts` / `search.ts`) from narrow server helpers (`server.ts` / `processing.ts`) and thin Server Actions (`actions.ts`), covered by zero-dependency Node unit tests under `tests/unit/` (`npm run test:unit`). Existing routes, database migrations, RLS policies, optimistic concurrency checks, photo authorization/TOCTOU re-checks, and admin-only analytics boundaries remain unchanged.

## Phase UI-C — Premium Seller Experience & 3–4 photo rules — 2026-11-25
- **Uniform 3–4 photo requirement**: Updated `src/lib/domain/equipment.ts` (`MIN_LISTING_PHOTOS = 3`, `MAX_LISTING_PHOTOS = 4`, all four `CATEGORY_CONFIG` entries set to `minPhotos: 3, maxPhotos: 4`), `src/features/photos/types.ts` (`PHOTO_LIMITS.minPerListing = 3`, `maxPerListing = 4`), Next.js upload eligibility (`src/features/photos/server.ts`), and forward-only PostgreSQL migration `supabase/migrations/20261125002500_photo_rules_and_seller_dashboard.sql`.
- **Database safety, safe photo detachment & legacy relist compatibility (migrations `025`–`026`)**:
  - `private.check_photo_count()`, `public.submit_listing()`, and `private.decide_listing()` enforce `3..4` photos for all new submissions and approvals across rackets, balls, shoes, and bags while preserving legacy `1..6` / `3..6` compatibility on already-published (`active`, `reserved`, `sold`, `traded`) listings during status/metadata transitions.
  - `public.listing_media` retains `sort_order between 0 and 5`, and no photos or Storage objects are automatically deleted.
  - `public.save_listing_photo()` rejects new attachments beyond 4 (`PT409 'Four photos maximum'`) and allows replacing any attached photo in-place preserving its exact `sort_order` (including legacy slots `4..5`) without consuming an additional slot. `public.update_listing_draft()` caps `cardinality(p_media_ids) <= 4` while leaving existing attachments untouched on text-only edits.
  - Migration `20261125002600_photo_detach_and_legacy_relist.sql` (`026`) adds `public.detach_listing_photo(p_listing_id, p_expected_version, p_media_id)` (owned by `padelhub_listing_writer`, zero new table grants) to detach a photo link from `draft`/`rejected` listings and compact remaining `sort_order` to `0..N-1` without deleting `media_assets` or `media-private` Storage objects, and extends `public.change_listing_status` with `'reopen'` (`sold`/`traded`/`archived` → private `draft`) so older listings with `<3` or `>4` photos can adjust photos/details before submitting for fresh admin approval (preserving exact one-step `'relist'` rollback behavior).
- **Enriched seller dashboard & profile DTOs**:
  - Migration `025` extends `public.get_my_listings()` with backwards-compatible summary fields (`offer_type`, `price_egp`, `is_negotiable`, `condition`, `version`, `updated_at`, `cover_media_id`, `photo_count`, and owner-only `rejection_reason` gated to `status = 'rejected' and last_decision = 'rejected'`) and extends `public.get_my_photo_drafts()` with `status` and `photo_count` using existing `padelhub_listing_writer` RLS policies with zero new table grants.
  - `src/features/listings/validation.ts` adds pure helpers `getListingFieldErrors()` and `getListingSubmissionReadiness()`, and `src/features/listings/actions.ts` returns per-field validation errors on `saveListing` and adds `runDashboardListingAction` for dashboard lifecycle transitions with strict DB ownership and optimistic `version` checks.
  - `src/features/profile/types.ts` & `validation.ts` expose `public_id` (already returned by `get_my_profile`, still stripping internal `user_id`) so `ProfilePage` embeds `ShareProfile` (storefront link + client-side QR code) directly when public and active.
  - Preserved the entire synchronous Sharp WebP (`320`/`800`/`1600`) EXIF-stripped upload pipeline, private `media-private` bucket, SHA-256 manifest verification, rate/concurrency limits, and double-checked `/api/media/[mediaId]` delivery unchanged.

## Media Optimization V1 — Client-Side Image Optimization & Efficient Public Delivery — 2026-11-25
- **Option B architecture (client preparation + authoritative server Sharp):**
  - Added reusable client preparation & queue modules under `src/features/photos/client/` (`constants.ts`, `format.ts`, `heic.ts`, `encode-canvas.ts`, `worker.ts`, `prepare-image.ts`, `prep-scheduler.ts`, `queue-controller.ts`, `upload-transport.ts`), completely decoupled from `PhotoForm`.
  - Enforces strict single-flight client preparation (`concurrency = 1`) via `PreparationScheduler` plus worker-level serialization (`prepare-image.ts`), accepts JPEG/PNG/WebP/HEIC/HEIF up to 50 MB / 65 MP (supporting 48 MP iPhone photos), skips unnecessary client re-encoding for already-suitable upright JPEG/PNG/WebP (`<= 2000 px`, `<= 1 MB`), uses native decoding first, and dynamically loads the unmodified standalone LGPL-3.0 ES module `/vendor/libheif/libheif-bundle.mjs` (staged from `libheif-js@1.23.5` via `scripts/sync-heic-assets.mjs`, zero Webpack bundling, zero initial bundle impact, accompanied by `THIRD_PARTY_NOTICES.md`, `/licenses/libheif-js-NOTICE.txt`, `/licenses/libheif-js-LICENSE.txt`, and runtime footer/`/about#open-source-notices` links) only when native HEIC decoding is unavailable.
  - Upgraded `PhotoForm` to a sequential multi-photo queue (1–4 photos within available slots, per-item previews/sizes/progress/cancel/retry, working cancelled-upload & cancelled-replacement retries with pre-retry authoritative reconciliation, abortable retry backoff, conflict & `Retry-After` cooldown enforcement on both batch and individual Retry buttons, direct plain-text/HTML HTTP `413` handling, single `router.refresh()` per settled batch). See `docs/MEDIA_PHYSICAL_DEVICE_CHECKLIST.md` and `docs/MEDIA_STAGING_MIGRATION_RUNBOOK.md`.
- **Bounded upload idempotency & server hardening (migration `027`):**
  - Forward-only migration `supabase/migrations/20261125002700_photo_upload_idempotency.sql` adds `private.photo_upload_idempotency` (`ENABLE` + `FORCE ROW LEVEL SECURITY`, zero client grants), service-only `public.get_photo_upload_receipt`, and optional trailing `p_upload_key` on `public.save_listing_photo` so ambiguous network drops never create duplicate attachments or unintended repeated replacements.
  - Added owner-only `GET /api/listings/[listingId]/photos?uploadKey=...` reconciliation handler (`reconcileListingPhotos`) and set `maxDuration = 60` on `/api/listings/[listingId]/photos`.
  - Reordered server upload checks in `src/features/photos/handlers.ts` so `inFlightUploads` concurrency reservation executes BEFORE `consume_photo_upload` (preventing saturated `503` responses from burning seller rate-limit quota) and aligned the server incoming body limit to `4,000,000` bytes (`maxUploadBytes`) while preserving `8 MiB` (`maxStoredBytes`) for stored variant manifests.
  - Applied benchmark-validated server optimizations: single-decode `1600 px` sRGB raw intermediate + bounded-parallel WebP encoding in `processing.ts` (-37% wall time, -18% CPU, -68% peak RSS delta on 12 MP inputs) and bounded-parallel Storage uploads in `server.ts` (-59% local Storage upload wall time), keeping `upsert: false`, immutable keys, and atomic DB attachment unchanged.
- **Anonymous public-first delivery & ETag revalidation:**
  - Updated `deliverPhoto` (`src/features/photos/handlers.ts`) so `?listing=<uuid>` checks anonymous public eligibility (`get_photo_delivery(asset, null, listing)`) FIRST with **zero** `verifiedUserClient()` / `auth.getUser()` / MFA calls. DB/service errors fail closed (`503 private, no-store`) with zero authenticated fallback.
  - Approved public photos return `Cache-Control: private, no-cache` and `ETag: "<selected-variant-sha256>"`; matching `If-None-Match` on `GET`/`HEAD` returns `304 Not Modified` after fresh DB eligibility verification without downloading Storage bytes. Revoked/ineligible photos return `404 private, no-store` (never `304`). Private owner previews and MFA-admin review photos remain `Cache-Control: private, no-store` without ETags.
  - Added privacy-safe numeric/enum server telemetry (`src/features/photos/telemetry.ts`) and `decoding="async"` / `fetchPriority` tuning on `PublicCard` and `ProductGallery`. See `docs/PHOTOS.md` for full capacity and benchmark details.

## Admin B inventory and direct moderation — 2026-11-26

Thin `/[locale]/admin/listings` routes compose `src/features/admin/inventory-page.tsx`; pure URL/DTO schemas live in `inventory.ts`. Queries use the verified user's Supabase client and migration 028's `admin_listing_inventory`, never a service-role client or a browser-side inventory download. The table has mobile stacked rows, semantic theme tokens, EN/AR text, and protected thumbnail URLs. A small client photo component handles unavailable previews; filters and pagination remain server-driven.

`admin_listing_inspection` composes the existing exact review snapshot with a minimal audit/timestamp/public-eligibility projection. Pending decisions retain existing approve/reject RPCs; direct removal has its own narrowly scoped RPC with profile-before-listing-before-media locking, expected versions, manifest comparison, required reason, READ COMMITTED enforcement, and an atomic audit insert. Removal changes lifecycle status, immediately invalidating the existing shared public eligibility predicate and conditional media delivery; it does not delete assets or fabricate a report. Read-only inspection of nonpublic drafts can omit unfinished media; that fallback is prohibited for pending/public decision snapshots.

Migration 028 reuses the existing review capability and RLS policies without adding tables, grants to client tables, indexes, or infrastructure. Admin photo authorization extends to all current ready attachments, with unchanged private proxy checks before/after retrieval, SHA-256 verification and no-store responses. See ADMIN_REVIEW.md for signatures, permissions and rollout ordering.

## Admin C seller management and listing allowances — 2026-11-26

Thin `/[locale]/admin/sellers` and `/[locale]/admin/sellers/[id]` routes compose `src/features/admin/sellers-page.tsx`, `seller-detail-page.tsx`, and client form islands in `seller-forms.tsx`; pure URL/DTO schemas, form validators, and SQLSTATE mappers live in `src/features/admin/sellers.ts`, with Server Actions in `src/features/admin/actions.ts`. All admin seller queries and mutations run under the verified MFA admin's Supabase client (never a service-role shortcut) and identify sellers strictly by immutable `seller_profiles.public_id`, keeping auth `user_id` and private WhatsApp numbers out of URLs, DTOs, and HTML.

Migration `029` (`supabase/migrations/20261126002900_admin_seller_management.sql`) introduces a dedicated hosted-safe capability role `padelhub_seller_admin` (`NOLOGIN NOINHERIT NOBYPASSRLS`, zero `auth` schema `USAGE`) with narrow column-level `UPDATE(account_type, listing_limit_override, version, updated_at)` on `public.seller_profiles` and zero `account_status` privilege, while `padelhub_review_writer` retains `moderation_profile_update` limited strictly to `account_status in ('suspended', 'hidden')`. Together, neither capability can restore a suspended or hidden seller to `active`. Account-type and allowance RPCs enforce `READ COMMITTED`, `platform_settings FOR SHARE` → `seller_profiles FOR UPDATE` lock ordering, expected `version`, transactional active+pending capacity validation against live `platform_settings` defaults, and atomic `private.audit_logs` records (using `target_type = 'profile'` and `target_id = public_id::text`, automatically resolved by Admin A's overview activity feed). Moderation (`hidden`/`suspended`) immediately revokes all shared public profile, QR, marketplace, contact, and conditional ETag media predicates without modifying saved listings, statuses, consent, or historical photos. Admin B's `admin_listing_inventory` gains a backwards-compatible trailing `p_seller_public_id uuid default null` filter for exact seller drill-down. Apply `029` after `028`. See ADMIN_REVIEW.md for full RPC contracts and manual operator restoration steps.

## MVP launch readiness — legal pages, account deletion & HTTP hardening — 2026-11-26

- **HTTP security headers (`next.config.ts`)**: Global baseline headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`) with explicit `Referrer-Policy: no-referrer` override preserved on `/(en|ar)/auth/(callback|recovery)` and `/api/contact/:path*`.
- **Optional Google OAuth visibility (`src/features/auth/auth-page.tsx`, `auth-form.tsx`)**: Server-side `/auth/v1/settings` check hides `Continue with Google` whenever `external.google !== true` while `continueWithGoogle` remains fail-closed.
- **Admin photo proxy (`src/features/photos/handlers.ts`)**: Postgres `42501` maps to HTTP `404 private, no-store` instead of `503`.
- **Legal pages (`src/features/legal/legal-page.tsx`, `src/app/[locale]/privacy/page.tsx`, `src/app/[locale]/terms/page.tsx`)**: Static bilingual EN/AR Privacy Policy and Terms of Use pages linked from `SiteFooter` and signup.
- **Authenticated account deletion request (`supabase/migrations/20261126003000_account_deletion_requests.sql`, `src/features/profile/account-deletion-card.tsx`)**: Adds `private.account_deletion_requests` (`ENABLE` + `FORCE ROW LEVEL SECURITY`, zero client grants) and `padelhub_profile_writer`-owned RPCs `get_my_account_deletion_request()` and `request_account_deletion(reason)` enforcing active non-recovery verified sessions (`private.verified_profile_caller()`). Submitting immediately sets `is_public = false` and `public_contact_consent = false` on any existing seller profile (revoking public visibility/WhatsApp/QR immediately without auto-deleting saved photos) and queues the request for the SQL-tested manual deletion procedure documented in `docs/OPERATIONS_AND_BACKUPS.md`. Apply `030` after `029`.

### Pending account deletion guard (031)

All owner profile/contact/listing mutation RPCs and service-only photo rate/save RPCs lock the existing Auth user row before domain rows and reject a pending deletion request. Request status changes update that lock row so stale fixed-snapshot transactions abort rather than miss a concurrent request. Request/status reads and sign-out remain accessible; no saved rows or images are automatically removed. Manual permanent deletion takes the same lock first and uses a durable Storage manifest after draining uploads. Recovery preserves capability ownership, ACLs and policies, or reconstructs them from matching migrations and the vendor privilege baseline; both paths have local authorization probes.
