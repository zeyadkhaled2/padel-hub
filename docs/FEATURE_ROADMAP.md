# Feature milestones

Updated 2026-11-21. Earlier day estimates were not measured and are withdrawn. Track completed features and test results instead.

## Done locally
- EN/AR, light/dark marketplace demo.
- Database permissions, profile operations, listing draft/submit/withdraw and admin approve/reject functions.
- Email-confirmed accounts, protected profile editing and session management. Everyone can buy and sell; Personal/Business are account types.
- Equipment-photo upload, resizing/metadata removal, saved previews, replacement and protected delivery. Synchronous requests; no background-worker system.

- Owner listing index and category-specific draft editor, saved-photo links, submit/withdraw feedback and stale-edit protection.

- Approved marketplace browse/search/filter/sort/pagination, listing details and fresh WhatsApp contact checks. Demo inventory lives under `/demo`.

- MFA-protected admin queue/review, approval/rejection and owner-visible rejection reasons.

- Seller sold/traded, archive and relist-for-approval controls, retaining photos and rejecting stale updates. Reservation is deferred.

- Public `/@username` profile pages, active approved listings and copy-link sharing; fixed MVP usernames and visitor language selection.

- Profile QR display/download with permanent public-ID redirects and visitor language selection.
- Shoes (EU size including halves) and bags alongside rackets/balls; sale-only accessories, approval and category filters.

- Verified-account reports, MFA-admin report handling, listing removal and profile suspension; 1,000-character notes retained. Restoration/appeal UI remains future work.

- Basic analytics: approximate views over 30 UTC calendar days for owners; WhatsApp-click totals are available only to MFA admins. No visitor identities or verified-sales claims.

- Exact EU shoe-size search (20–55, half sizes), URL persistence, pagination and category shortcut reset.

- Optional racket specifications: model year (2010–2035), weight in grams (300–420 g), and shape (`round`, `teardrop`, `diamond`, `hybrid`) in racket forms, approved public detail pages, and MFA-admin review (EN/AR), reusing existing schema/RPCs.

- **Phase 2A — Isolated hosted Supabase staging:** provisioned `padelhub-staging` (`eu-central-1`, Free plan, \$0/mo), added forward-only migration `019` (`hosted_auth_claim_helpers`), verified all 19 migrations, email-confirmation enforcement, TOTP MFA (`aal2`) + immediate revocation, private Storage/EXIF/hash-verified delivery, RLS isolation, EN/AR desktop & mobile smoke checks, fail-closed server env hardening, `.env.example`, and deployment/rollback runbooks (`docs/STAGING_SETUP.md`, `docs/STAGING_READINESS_REPORT.md`).

- **Phase Admin A — Overview Dashboard:** reusable `AdminShell` navigation (Overview, Listings, Reports live; Sellers, Analytics, Audit log, Settings, Operations labeled Planned), MFA-enforced `admin_dashboard_overview()` RPC (migration `023`), 11 live DB-derived KPIs (including seller-reported sold/traded and caveated WhatsApp clicks), Needs Attention queue highlights, genuine 7-day/30-day UTC trends and 7-day daily engagement breakdown, and privacy-safe recent audit activity feed across EN/AR, RTL, light/dark, and mobile/desktop layouts.

- **Phase Admin B — Listing Management (merged on `main` @ `23f5dec`, PR #12):** Dedicated server-paginated inventory, all lifecycle states, search and combined filters, exact review snapshot reuse, private photo inspection and reasoned/version-checked direct removal. Forward-only migration `028`; no new infrastructure.

- **Phase Admin C — Seller Management (merged on `main` @ `2b78c5c`, PR #13):** Dedicated `/[locale]/admin/sellers` and `/[locale]/admin/sellers/[id]` workspace (activated in `AdminShell`), server-side search/filters/sorting/pagination, dynamic `platform_settings` defaults, per-seller account-type and `listing_limit_override` management with transactional active+pending capacity enforcement, reasoned/confirmed hide & suspend moderation (preserving saved listings/photos, immediately revoking public profile/QR/marketplace/contact/conditional-media eligibility; restoration deferred to manual operator procedure), exact Admin B `?seller=` filtering, and 5 localized EN/AR audit labels in Admin A. Forward-only migration `029` with separated `padelhub_seller_admin` / `padelhub_review_writer` least-privilege capabilities.

- **MVP Launch Readiness Pass (PR #14 merged at `a977117`):** Hidden nonfunctional Google OAuth button when disabled, baseline HTTP security headers (`next.config.ts`), `42501 -> 404` admin photo proxy hardening, bilingual EN/AR `/privacy` and `/terms` pages, authenticated account deletion request (`migration 030`, immediately taking public profile/listings/WhatsApp offline) + SQL-verified manual deletion runbook, corrected fail-closed manual seller restoration runbook (`active`/`reserved`/`sold`/`traded`), zero-dependency backup/verify helper (`scripts/backup-supabase.mjs`) with passing isolated DB restore drill and hosted `media-private` SHA-256 backup check, operational monitoring/quota guide (`docs/OPERATIONS_AND_BACKUPS.md`), and prioritized P0/P1/P2 launch & physical-device checklist (`docs/LAUNCH_READINESS.md`).

- **Hosted Staging Verification & Free-Tier Prep (PR #15 merged at `a1060de`) & Live Hosted Vercel `fra1` Integration (2026-11-27):** Pending-deletion read-only UI across `/account`, `/account/listings`, editor, and photos; `"regions": ["fra1"]` in `vercel.json`; migrations `027–031` applied to `padelhub-staging` (`0` Security Advisor errors); isolated Vercel Preview branch `staging` (`https://padel-hub-git-staging-zeyadkhaled2s-projects.vercel.app`, `fra1`) connected exclusively to `padelhub-staging` (`0` Production env vars) with live HTTPS `smoke` (`25/25`), `smoke-phase2b` (`13/13`), Admin B/C + media idempotency, `verify-revoked-admin` (`2/2`), and `fra1` telemetry (`200/200` invocations in `fra1`, `0` 5xx, `244–289 MB` peak RAM) all passing.

## Feature freeze — Pre-production & pilot readiness

Feature development is **officially frozen after Admin C**. Admin D–F are deferred until after the controlled pilot. See [LAUNCH_READINESS.md](LAUNCH_READINESS.md) and [FREE_TIER_LAUNCH.md](FREE_TIER_LAUNCH.md) for the exact remaining owner-gated items:
1. **P0 — Staging Auth redirects & physical-device QA:** Update `padelhub-staging` Auth Redirect URLs for `https://padel-hub-git-staging-zeyadkhaled2s-projects.vercel.app`, and complete the short real iPhone Safari + Android Chrome checklist (`docs/LAUNCH_READINESS.md` & `docs/MEDIA_PHYSICAL_DEVICE_CHECKLIST.md`) including real HEIC camera photo uploads and WhatsApp tap-to-chat.
2. **P0 — Production approval, eligibility, domain & Resend SMTP:** Resolve Vercel Hobby commercial-use eligibility before inviting real sellers (no paid subscriptions preauthorized), purchase/verify domain and configure Resend Free SMTP + DNS (`auth.<domain>`, link tracking off) with real-inbox signup/recovery testing, provision dedicated clean production Supabase (`eu-central-1`, `001–031`), enable provider 2FA, enroll production admin TOTP MFA, and verify first production backup/restore.
3. **P1 — Optional during pilot:** Google OAuth (appears automatically once enabled), `robots` indexing decision, Supabase HIBP leaked-password check (plan-dependent), and post-pilot policy decisions (seller restoration UI, owner account-type switching).

**Deferred past pilot (P2):** Admin D–F (reports enhancements, analytics/audit log explorer, settings/operations UI), automated self-service account deletion job, seller restoration/appeal UI, reservations, payments/checkout, ratings/reviews, internal messaging, and subscriptions.

**Frontend on hold:** Ziad's independent `v2` direction remains retired (`archive/v2-final`); do not reintroduce it.

No new specialist orchestration or handoff reports. No checkout, payments, automatic expiry or automatic deletion of saved photos. Seller-reported deal counts and any future self-service seller restoration controls require explicit owner approval.

Current next milestone: **Production readiness** (external SMTP/OAuth completion, hosted frontend validation after migrations 027–031, backups/restore drill, physical-device media checks). Detailed progress/checks: PROGRESS.md. Staging setup/rollback: STAGING_SETUP.md. Local account/photo run instructions: LOCAL_ACCOUNTS.md and PHOTOS.md.

## After MVP
- Reservation and available-again controls (deferred by Ziad on 2026-11-18).
- Simple swap cash-difference preferences: later improvement, no internal negotiation system yet.
- Escrow/authenticity operations, financing, checkout bundles and racket comparison: deferred.
