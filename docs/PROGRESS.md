# PadelHub progress

Updated: 2026-11-21. Isolated hosted Supabase staging (`padelhub-staging`, `eu-central-1`, Free plan) is provisioned and verified; hosted production backend and external SMTP (Phase 2B) remain unconfigured. Main-branch pushes are authorized and may trigger Vercel frontend preview deployment.

## Completed locally
- Hosted Supabase staging foundation (Phase 2A): isolated project `padelhub-staging` (`sxghreukdkxclymysryp`, `eu-central-1`, Free plan, \$0/mo), forward-only hosted Auth-claim helpers (`migration 019`), private `media-private` bucket, fail-closed server-only env parsing (`src/server/supabase/env.ts`), `.env.example`, non-destructive staging verification scripts (`scripts/staging-app.mjs`), and runbook/readiness docs (`docs/STAGING_SETUP.md`, `docs/STAGING_READINESS_REPORT.md`).
- Optional racket specifications: model year (2010–2035), weight in grams (300–420 g), and racket shape (`round`, `teardrop`, `diamond`, `hybrid`) in racket listing drafts, public detail pages, and MFA-admin review, with EN/AR localization, blank-to-null clearing, stale-edit preservation, and non-racket exclusion. Reuses existing database schema/RPCs without new migrations.
- Exact EU shoe-size filter (20–55, half sizes), preserved in shared URLs/pagination/language changes. Non-shoe category shortcuts clear it. Migration 018 applied locally.
- Basic analytics: owner totals and MFA-admin marketplace totals for the last 30 UTC calendar days; owners see approximate listing views only; WhatsApp clicks are MFA-admin-only. Private daily counters, no visitor identifiers. Migration 016 applied locally.
- Reports/moderation: verified-account reports, duplicate protection and 5/day limit; MFA-admin queue, dismissal, listing removal and profile suspension with target/report version checks and audit records. Details and decision notes remain limited to 1,000 characters. Migration 015 applied locally.
- QR show/hide and PNG download, generated on demand in-browser. Permanent public-ID links resolve only public active profiles, then use visitor language. No external QR service or stored image.
- Categories: rackets, balls, padel shoes and bags. Shoes require EU size (20–55, half sizes) before submission; shoes/bags are sale-only with 1–6 photos. Category filters, owner/editor, admin review and public details updated.
- Public `/@username` profiles show opt-in profile details and approved active listings, with pagination and locale-neutral Copy profile link. Visitor language selection uses the existing locale cookie/browser preference. Usernames fixed after creation; migration 012 revokes rename API access while preserving public IDs and dormant alias data.
- Verified email accounts, private-by-default profiles and contact preferences. Everyone can buy and sell.
- Owner listing editor, protected photo upload/replacement, submission and withdrawal with stale-edit protection.
- Approved marketplace search/filters/sort/pagination, listing details and server-checked WhatsApp contact. Demo inventory is separate under `/demo`; EN/AR and light/dark supported.
- Admin authenticator enrollment/verification, 24-item pending queue, authorized full-size photo review, approve/reject and owner-visible rejection reasons. Decisions retain exact reviewed versions/media; snapshots are encrypted in action closures.
- Sold/traded, archive (published or pending listings), and relist-for-approval controls added. Migration 011 applied locally; ownership, expected versions and atomic submission checks enforced. Photos retained.
- Migration 010 applied locally. TOTP enabled in running Auth; previous Auth container retained stopped. User-selected verified account received local admin access; its authenticator setup is user-controlled.

## Verification
- Latest `npm run check`: lint, TypeScript and production build passed.
- Full browser suite: 16/16 passed, including downloaded QR PNG decoded independently, no-store ID redirect, visitor Arabic preference, shoe half-size persistence, bags, existing auth/admin/listing flows.
- Database: 554 assertions plus existing concurrency/isolation checks passed. Migrations 013–014 applied locally; no hosted migrations.
- Earlier 24 QR/profile and shoe-form locale/theme/width checks passed; mobile screenshots inspected. `git diff --check` passed.
- Earlier Vercel missing-module failure fixed by anchoring `/supabase/` in `.vercelignore`. Hosted backend remains unconfigured.

## Next
1. User completes authenticator setup at `/en/admin`. Minimal review UI works; refinement prompt is in [ADMIN_REVIEW.md](ADMIN_REVIEW.md).
2. Hosted auth/email, recovery including MFA recovery, backups/restore and deployment checks before launch.

## Latest scope decision
- 2026-11-20: user cancelled the v2 merge. In-progress merge aborted; original branch untouched. Review patch saved only in ignored .cache for possible later use.
- 2026-11-19: Ziad is still working on frontend `v2`. Review and merge are deferred until he explicitly says it is ready; continue functional work independently.
- Approved research priorities: shoe-size filtering, optional racket specifications, and a permissioned pilot with 5–10 sellers. Simple swap cash-difference preferences are a later improvement; escrow, financing, checkout bundles and comparison tools are deferred. Scrape/competitor claims have not been independently verified.
- Usernames fixed for MVP. Share `/@username` without language; permanent public profile IDs remain internal identities and QR targets. Username changes/alias policy deferred.
- 2026-11-18: reservation and available-again controls deferred until after MVP; sold/traded/archive/relist now implemented locally. Existing reservation schema support retained, with no reservation controls exposed.

## Latest reports verification
- Reports commit `87e5844` is on main. On 2026-11-19, clean isolated install and `npm run check` passed; both final admin browser tests passed (2/2), including 12 EN/AR theme/width report-queue checks. Arabic dark mobile screenshot inspected. Earlier full browser suite: 16/16; database: 521 assertions plus races. No new application changes were needed.
- Frontend branch `v2` is based on the old demo-only baseline; review/integrate it against current main before merging. Original `E:/projects/padelHub` remains on v2.

## Constraints and preview
- No checkout, automatic expiry or automatic deletion of saved photos. Keep implementation and notes small.
- Preview: http://127.0.0.1:3100/en ; admin: `/en/admin`; owner listings: `/en/account/listings`; demo: `/en/demo`.
- Hosted admin provisioning and production readiness remain unfinished. Docker service ports are not restricted to loopback; keep inventory synthetic until that is addressed.
- Run instructions: [LOCAL_ACCOUNTS.md](LOCAL_ACCOUNTS.md), [PHOTOS.md](PHOTOS.md). Remaining milestones: [FEATURE_ROADMAP.md](FEATURE_ROADMAP.md).

## Latest analytics verification — 2026-11-19
- `npm run check` passed; lint/typecheck also passed after final test edits. Database: 536 assertions plus existing races passed. Admin browser tests passed separately on desktop/mobile (2/2), including 8 owner-analytics locale/theme/width checks and existing admin/report layouts; Arabic dark mobile screenshot inspected.
- Tested view recording/reload deduplication, cross-origin rejection, owner isolation, admin MFA, 30-day boundary, hidden-content exclusion and WhatsApp redirect during disabled analytics writes. Browser testing caught and fixed the metrics RPC volatility setting required by admin role locking.
- Counts begin at activation; no backfill. Tab/day deduplication is best-effort; blocked storage/JS or network failures undercount, repeated clicks/bots/self-visits can inflate counts. Not unique people or verified sales. No hosted migration/deployment verification this session. Frontend v2 review/merge remains on hold.
- Next: shoe-size filter, then optional racket specifications. No new agents or dependencies.

## Admin-only WhatsApp counts — 2026-11-19
- Migration 017 applied locally: owner metrics responses omit the contacts key (including null/false flags). MFA-admin totals retain clicks. Seller dashboard renders only views; product/architecture/roadmap updated.
- Checks: npm run check passed; 539 database assertions plus existing concurrency checks passed; desktop/mobile admin browser tests 2/2 passed, including owner API/UI exclusion and admin visibility. Existing EN/AR theme/width checks passed; Arabic dark mobile screenshot inspected. git diff --check passed.
- Hosted backend still unconfigured; no hosted migration applied. Next: shoe-size filtering, then optional racket specifications. v2 remains untouched.

## Shoe-size search — 2026-11-20
- Migration 018 applied locally. Public search accepts exact EU size 20–55 in half steps; URL, pagination and language changes retain the filter. Non-shoe category shortcuts clear it; invalid sizes fail validation. No new dependencies or schema indexes.
- Database: 554 assertions plus existing races passed. Existing marketplace browser suite: 10/10 passed. Final npm run check passed; size-specific desktop/mobile tests 2/2 passed after explicit accessible label fix. Arabic dark mobile screenshot inspected; git diff --check passed.
- No v2 merge or hosted migration. Next: optional racket specifications.

## Phase 2 status review — 2026-11-20
- Read-only code/documentation review: hosted Supabase remains unconfigured; local auth/MFA, authorization tests and some upload/report limits exist. External email/recovery/Google login, full production security/abuse review, account deletion, backups/restore/monitoring and real-user pilot remain pending. v2 integration remains cancelled/on hold per latest decision.
- Current checkout is refactor/mvp-architecture with substantial in-progress edits; preserved all work. No tests rerun and no production settings inspected or changed in this status review; earlier recorded passes do not validate the current uncommitted refactor.

## Phase 1 architecture & code quality refactor — 2026-11-20
- Branch: `refactor/mvp-architecture` (branched from `main` at `e5509b2`). No database schema, migration, route, URL, API contract, or security-boundary changes; `v2` untouched; no new dependencies added.
- Completed:
  - Added shared domain configuration (`src/lib/domain/equipment.ts` with typed `CATEGORY_CONFIG`), centralized Zod validators (`src/lib/validation/shared.ts`), consistent Postgres SQLSTATE classification (`src/lib/errors/domain.ts`), and stateless Supabase client factories (`src/server/supabase/clients.ts`).
  - Replaced broad index signatures and `Record<string, unknown>` casts with explicit types and category-discriminated unions across listings, marketplace, profile, auth, photos, admin, reports, and analytics, with Zod boundary parsing on RPC responses (preserving raw `media_manifest` references for Postgres JSONB review equality).
  - Separated pure validation/normalization (`validation.ts` / `search.ts`), narrow server helpers (`server.ts` / `processing.ts`), and thin Server Actions (`actions.ts`) across all features; shared MFA admin gate (`src/features/admin/server.ts`) between admin review and reports queues.
  - Added zero-dependency Node unit test runner and 25 focused unit tests in `tests/unit/` (`npm run test:unit`).
- Verification:
  - `npm run lint`: passed.
  - `npm run typecheck`: passed.
  - `npm run build`: passed (23/23 routes).
  - `npm run test:unit`: 25/25 passed.
  - `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e -- --workers=1`: 14/14 runnable tests passed (desktop + mobile foundation, media-boundary, shoe-search); 4 skipped (`account.spec.ts` and `admin.spec.ts` require running local Docker/Supabase Auth & Storage). Note: parallel `--workers=2` against cold `next dev --webpack` on Windows hit a Next.js dev manifest race on `/en/demo`; `--workers=1` passed cleanly.
  - `npm run test:db`: blocked locally because Docker Desktop daemon is not running (`dockerDesktopLinuxEngine` pipe unavailable). No database migrations or SQL were modified.
  - `git diff --check`: passed.
- Next: Start Docker/local Supabase to run `npm run test:db` and `node scripts/local-app.mjs test --workers=1` against the PR branch before merging `refactor/mvp-architecture` into `main`.

## PR 1 review — 2026-11-21
- Reviewed architecture refactor at 5974e0e against e5509b2; local checkout matched PR head. No confirmed functional/security regression found in inspected changes, including RPC response schemas versus migrations, owner/server authority, review snapshot handling and protected photo delivery.
- Independent checks: 25/25 unit tests; lint and typecheck passed; production build passed after retry outside sandbox (initial EPERM mkdir); Chrome E2E with one worker 14 passed, 4 authenticated tests skipped. GitHub PR workflow 44824227575 succeeded. Docker daemon unavailable, so database/Auth/Storage integration tests were not rerun.
- Recommendation: worthwhile refactor, hold merge until full local Auth/Storage account/admin tests and database suite pass on PR head, and wire npm run test:unit into CI (currently absent from workflow and npm run check). No source fixes, PR comments, merge or deployment performed.

## PR 1 integration verification — 2026-11-21
- Closed both pre-merge testing gaps on `refactor/mvp-architecture` (HEAD `aec8fe4`, which wired `- run: npm run test:unit` into `.github/workflows/ci.yml`):
  - `npm run test:db`: passed — all 18 migrations applied cleanly to a disposable scratch database, 554/554 SQL assertions passed across 14 test files, plus all concurrent lock/race and fixed-snapshot isolation checks passed; scratch database removed.
  - `node scripts/local-app.mjs test --workers=1` against live local Supabase Auth/Mailpit/Storage/DB and `node scripts/local-app.mjs serve`: **18/18 passed (0 skipped)**, including desktop and mobile `account.spec.ts` (email verification, profile/contact RPCs, conflicts, session refresh, photo upload/replacement/EXIF stripping/hash verification/races, rackets/balls/shoes/bags drafts, `/@username`, QR PNG decode & redirect, WhatsApp redirect, sold/archive/relist/withdraw) and desktop and mobile `admin.spec.ts` (real TOTP enrollment/challenge, review photos, encrypted snapshot closure, rejection/approval, stale decision conflict, owner-vs-admin analytics isolation, reports removal/suspension, MFA re-challenge and role revocation).
  - `npm run test:unit` (25/25), `npm run lint`, and `npm run typecheck`: all passed.
- PR #1 (`https://github.com/zeyadkhaled2/padel-hub/pull/1`) remains open and unmerged for final user approval; `v2` remains untouched.

## Optional racket specifications (Phase 1.5) — 2026-11-21
- Branch: `feature/racket-specifications` (created cleanly from `origin/main` at `7627ddb`, after PR #1 was squash-merged). Ported and reconciled uncommitted work from the reference worktree (`C:\Users\COMPUMARTS\.codex\worktrees\backend-reports\padelHub`) onto the Phase 1 domain/validation architecture while leaving the reference worktree and `v2` untouched. No SQL migrations or new dependencies added.
- Completed:
  - Domain & shared validation: added `RACKET_YEAR_BOUNDS` (`2010..2035`), `RACKET_WEIGHT_BOUNDS` (`300..420`), and `hasRacketSpecs` on `CategoryConfig` (`src/lib/domain/equipment.ts`), plus `racketYearSchema`, `racketWeightGramsSchema`, and `parseOptionalBoundedInt` (`src/lib/validation/shared.ts`).
  - Listing lifecycle: added optional `racket_year`, `racket_weight_grams`, and `racket_shape` to `ListingDraftPatch`, `ListingFormFieldKey`, `ownerListingSchema`, `buildListingDraftPatch`, and `ListingForm` (`<fieldset>` shown only when `categoryConfig.hasRacketSpecs` is true). Blank inputs save as `null`; non-racket categories force `null`; `racket_purchase_date` is intentionally omitted from `ListingDraftPatch` so Postgres `jsonb_populate_record` preserves existing purchase dates.
  - Public detail & admin review: tightened `publicListingSchema` and `reviewListingSchema` bounds, added `getPublicRacketSpecRows` for localized public detail rendering, and localized `racket_shape` values in MFA-admin review (`AdminReviewPage`) and EN/AR message catalogs (`messages/en.json`, `messages/ar.json`).
  - Tests: expanded unit tests (`tests/unit/listings-validation.test.ts`, `tests/unit/marketplace-and-analytics.test.ts`, `tests/unit/photos-admin-reports.test.ts`) and authenticated E2E tests (`tests/e2e/account.spec.ts`, `tests/e2e/admin.spec.ts`) covering valid boundaries, blank-to-null, partial clearing, server-side invalid rejection with form retention, stale-edit conflict retention, non-racket exclusion, EN/AR public detail display, EN/AR light/dark narrow mobile layout, and EN/AR MFA-admin review & approval.
- Verification:
  - `npm run lint`: passed.
  - `npm run typecheck`: passed (`next typegen && tsc --noEmit`).
  - `npm run build`: passed (23/23 routes).
  - `npm run test:unit`: 27/27 passed.
  - `npm run test:db`: passed (18 migrations applied cleanly to scratch DB, 554/554 SQL assertions plus all concurrency/race and snapshot isolation checks passed; scratch DB removed).
  - `node scripts/local-app.mjs test --workers=1` (against `node scripts/local-app.mjs serve` and local Supabase Auth/Mailpit/Storage/DB): 18/18 passed (0 skipped) across desktop and mobile (`account.spec.ts`, `admin.spec.ts`, `foundation.spec.ts`, `media-boundary.spec.ts`, `shoe-search.spec.ts`).
  - Visually inspected `.cache/racket-specs-ar-dark.png` (390px Arabic dark RTL mobile racket specs section): clean alignment, labels, contrast, and zero overflow.
  - `git diff --check`: passed.
- Limitations & next: hosted backend remains unconfigured; no hosted migrations or deployments performed; PR opened into `main` without merging; next functional milestone is production readiness (recovery, external email, security/abuse checks).

## Hosted Supabase staging (Phase 2A) — 2026-11-21
- Branch: `chore/hosted-supabase-staging` (branched cleanly from `origin/main` at `f498f7a`, after PR #2 was squash-merged). Existing local Supabase (`padelhub-local`), `main`, `v2`, reference worktree (`C:\Users\COMPUMARTS\.codex\worktrees\backend-reports\padelHub`), and existing Vercel preview (`padel-hub-beta.vercel.app`) were left untouched. No production Supabase project exists or was altered.
- Provisioned & configured (owner-authorized, \$0/month):
  - Created isolated Supabase project `padelhub-staging` (`sxghreukdkxclymysryp`, `eu-central-1` / Frankfurt, `Ziad's org`, Free plan, PostgreSQL 17.12).
  - Verified Auth (`mailer_autoconfirm = false`, `anonymous_users = false`, `email = true`, free App Authenticator TOTP MFA enabled, `Site URL` = `http://127.0.0.1:3100`, exact EN/AR callback Redirect URLs configured).
  - Provisioned private `media-private` Storage bucket (`public = false`, `8 MiB`, `['image/webp']`, zero public/anon/authenticated Storage policies).
- Code, migrations & runbooks:
  - Added forward-only migration `20261121001900_hosted_auth_claim_helpers.sql` (`019`) removing runtime dependency of the three `NOLOGIN NOINHERIT NOBYPASSRLS` writer roles on direct `USAGE ON SCHEMA auth` (which `postgres` cannot delegate on hosted Supabase where `supabase_admin` owns `auth`) via parameterless, `postgres`-owned `SECURITY DEFINER` helpers in `private` (`auth_uid`, `auth_jwt`, `verified_auth_caller`) revoked from `public`/`anon`/`authenticated`/`service_role`, updating all 32 `public.*`/`private.*` policies without rewriting historical migrations `001`–`018`.
  - Applied migrations `001`–`005` to `padelhub-staging`, confirmed expected hosted `006` failure (`SQLSTATE P0001`), marked `20261117000600` superseded via `supabase migration repair --status applied`, and applied `007`–`019` cleanly via Supabase CLI (`19/19` migrations present; all 20 domain tables have `FORCE ROW LEVEL SECURITY`; 0 direct `anon`/`authenticated` table grants; 0 `ERROR`-level Supabase Security Advisors).
  - Hardened server-only env config (`src/server/supabase/env.ts`, `config.ts`, `clients.ts`, `src/features/photos/server.ts`) with strict origin normalization, HTTPS enforcement for remote Supabase URLs, fail-closed swapped/duplicate key rejection, and zero fallback to `NEXT_PUBLIC_*`/`SUPABASE_*`; added `.env.example`, `tests/unit/supabase-config.test.ts`, `supabase/tests/hosted-auth-helpers.test.sql`, non-destructive staging runner (`scripts/staging-env.mjs`, `scripts/staging-app.mjs`), `docs/STAGING_SETUP.md`, and `docs/STAGING_READINESS_REPORT.md`.
- Verification:
  - Hosted staging non-destructive smoke & security suite (`node scripts/staging-app.mjs smoke` + `verify-revoked-admin` against local production Next.js connected to `padelhub-staging`): **19/19 smoke checks + 1/1 immediate admin revocation check passed (0 failed, 0 skipped)** — covering Auth confirmation enforcement, unverified rejection, verified login/cookies/refresh/logout, open-redirect protection, direct DB/Storage denial, private photo upload/EXIF stripping/race `[201, 409]`/oversize `413`/replacement/hash-verified delivery, real hosted TOTP MFA (`aal2`) + EN/AR admin review/reject/approve, EN desktop & AR 390px mobile public detail, WhatsApp redirect, abuse reports, listing withdrawal media revocation, and immediate role revocation. Temporary test admins revoked; all synthetic listings withdrawn to `draft`.
  - `npm ci`: passed (438 packages).
  - `npm run check` (`lint`, `typecheck`, `build` 23/23 routes): passed.
  - `npm run test:unit`: **30/30 passed**.
  - `npm run test:db`: **574/574 SQL assertions** (15 files, including 20 hosted-mode assertions with zero writer `auth` schema USAGE) + **14 concurrency/lock/isolation races** passed; scratch DB removed; local Studio DB unchanged.
  - Local authenticated Playwright suite (`node scripts/local-app.mjs test --workers=1` against `node scripts/local-app.mjs serve`): **18/18 passed (0 failed, 0 skipped)** across desktop & mobile.
  - `git diff --check`: passed; full diff audited for zero secret leakage.
- Limitations & next: External transactional SMTP (Resend) is not yet configured (Free-tier built-in auth email ~2/hr is not claimed as external delivery); Vercel Hobby 4.5 MB serverless body cap vs. 8 MiB photo limit documented; hosted staging web preview left on local-connected verification per owner preference so Vercel `main` preview remains untouched; backups/restore drill belongs to Phase 2D. Next milestone: **Phase 2B (External transactional email & auth recovery)**.
