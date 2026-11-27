# Raketna — MVP Launch Readiness & Go/No-Go Checklist

Last updated: 2026-11-27
Target controlled pilot: **10 real sellers · 50–100 listings** (independent coaches, Instagram retailers, Facebook resellers in Egypt)
Feature freeze status: **FROZEN** after Admin C merge (`2b78c5c`). No Admin D–F or unrelated features before pilot completion.

---

## 1. Selected infrastructure — 2026-11-27

Owner decision: **Vercel Hobby, Supabase Free, Resend Free through Supabase custom SMTP, GitHub Free**. Domain setup is separate. No purchases, billing activation, Railway migration or additional services are authorized.

Vercel Hobby is retained for eligible non-commercial validation. Resolve real-seller pilot eligibility before inviting sellers; a free marketplace is not automatically non-commercial under [Vercel's terms](https://vercel.com/legal/terms). Do not silently change plans.

Vercel Hobby Preview deployment on branch `staging` (`https://padel-hub-git-staging-zeyadkhaled2s-projects.vercel.app`, `dpl_GYAKq4kihpbzYbZG78kmnhVMaa8M`) is **live and verified in `fra1` (Frankfurt)** (`nodejs26.x`, Fluid Compute `true`, `2,048 MB` provisioned, `244–289 MB` observed peak, `0` HTTP `5xx` across 200 sampled invocations) connected exclusively to `padelhub-staging` (`sxghreukdkxclymysryp`, `eu-central-1`), while Production (`main`, `padel-hub-beta.vercel.app`) retains **0** env vars. See [STAGING_SETUP.md](STAGING_SETUP.md) and [FREE_TIER_LAUNCH.md](FREE_TIER_LAUNCH.md) for current staging evidence, quotas, and owner steps.

---

## 2. Focused Launch Security Review Summary (2026-11-26)

| Area | Verification Result | Fixes Applied in Readiness Pass |
| --- | --- | --- |
| **RLS & Unauthorized Access** | All **23/23** `public`/`private` domain tables enforce `ENABLE` + `FORCE ROW LEVEL SECURITY`; **0** direct `anon`/`authenticated`/`PUBLIC` table grants; **0** `ERROR`-level Supabase Security Advisors on `padelhub-staging`. | Added `private.account_deletion_requests` with `FORCE RLS`, zero client grants, and owner-scoped `padelhub_profile_writer` policies (migration `030`). |
| **Admin Authorization & MFA** | Active `private.admin_roles` + `aal2` TOTP enforced inside PostgreSQL on all Admin A/B/C RPCs; recovery sessions blocked at both `aal1` and `aal2`; role revocation takes effect immediately; zero privilege elevation via user metadata or UI. | Verified `padelhub_seller_admin` / `padelhub_review_writer` split blocks seller reactivation at DB layer; corrected manual seller restoration SQL in [ADMIN_REVIEW.md](ADMIN_REVIEW.md) to cover `active`/`reserved`/`sold`/`traded` and abort without auditing on failed update. |
| **Exposed Secrets & XSS** | Recursive `src/` scan confirmed **0** `NEXT_PUBLIC_*` env vars, **0** `dangerouslySetInnerHTML`/`eval`/`innerHTML`, server-only `PADELHUB_SUPABASE_SERVICE_ROLE_KEY` in `src/server/supabase/env.ts` only, fail-closed HTTPS/key validation. | Added global baseline HTTP security headers in `next.config.ts` (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`) while preserving `Referrer-Policy: no-referrer` on `/auth/callback`, `/auth/recovery`, and `/api/contact/*`. |
| **Rate Limits & Abuse Prevention** | Photo uploads capped at 2 concurrent per Node process + DB sliding window (`consume_photo_upload`, 256 MB per-account retained cap) + 4 MB incoming cap; reports capped at 5/24h + 1 open per target; Supabase Auth email rate limits (60s per-user cooldown, 30/hr SMTP default). | Verified concurrency check runs before rate-limit consumption (`503` never burns quota). |
| **Private Media Protection** | `media-private` bucket (`public = false`, zero public/auth policies); EXIF stripped; SHA-256 verified before serving; pre/post-download DB checks; conditional `ETag`/`304` revoked immediately (`404 no-store`) when listing/seller becomes ineligible. | Fixed `admin_photo_delivery` Postgres `42501` mapping in `src/features/photos/handlers.ts` to return HTTP `404 private, no-store` instead of noisy `503`. |
| **Auth & Broken Flow Prevention** | Email confirmation enforced (`mailer_autoconfirm = false`); anonymous sign-in disabled; server-side recovery-session isolation; fixed callback destinations. | Hid nonfunctional `Continue with Google` button on `/auth/signin` & `/auth/signup` whenever `external.google !== true` while keeping server-side action fail-closed. |
| **Privacy, Terms & Account Deletion** | Accessible EN/AR `/privacy` and `/terms` pages reflecting actual marketplace behavior linked in footer & signup; authenticated `/account#account-deletion` request immediately takes public profile/listings/WhatsApp offline; SQL-tested manual operator deletion runbook. | Implemented in migration `030`, `src/features/legal/`, `src/features/profile/account-deletion-card.tsx`, and [OPERATIONS_AND_BACKUPS.md](OPERATIONS_AND_BACKUPS.md). |

---

## 3. Prioritized Remaining Tasks (P0 / P1 / P2)

### P0 - Must complete before onboarding real sellers
1. **Resolve Vercel Hobby eligibility for the real-seller pilot.** Keep the owner-selected free tier for eligible non-commercial validation and private demonstration. No paid plan or migration is authorized.
2. **Update `padelhub-staging` Auth Redirect URLs for the hosted staging URL** (owner Supabase Dashboard step): add the exact 4 `https://padel-hub-git-staging-zeyadkhaled2s-projects.vercel.app/{en,ar}/auth/{callback,recovery}` URLs and update Site URL so browser-initiated staging signup/recovery redirects land on Vercel rather than `http://127.0.0.1:3100`.
3. **Domain and real SMTP delivery (deferred until domain purchase).** Configure Resend/DNS (`auth.<domain>`), exact redirects, and bilingual templates; verify real-inbox confirmation/recovery. Generated token-hash link tests do **not** satisfy this gate.
4. **Separate production approval and provisioning.** Use a dedicated clean Supabase Free project in `eu-central-1`, migrations `001–031` with documented `006` repair, private `media-private` Storage, and isolated Production variables. Follow [FREE_TIER_LAUNCH.md](FREE_TIER_LAUNCH.md); do not provision until separately approved.
5. **Operator security and recovery.** Confirm provider 2FA (GitHub, Vercel, Supabase, Resend), production admin TOTP/non-admin/revoked denial, backup operator, encrypted independent DB/media backups, and an actual hosted restore/authorization rehearsal.
6. **Physical-device sign-off.** iPhone Safari and Android Chrome camera/HEIC, interrupted-connection retry/cancel, account deletion, Arabic RTL/dark mode, and WhatsApp handoff remain unverified on real devices.

### Optional indexing decision (not a launch blocker)
- **Flip SEO `robots` indexing decision (if desired)**: keep `noindex` during invite-only pilot OR remove `noindex` on public browse/detail/profile/legal pages only when explicitly ready for public search indexing (never index `/auth`, `/account`, or `/admin`).

### P1 - Staging follow-up & optional during pilot
1. Review and merge the hosted-validation PR (origin-scoped OIDC smoke support + updated hosted staging documentation).
2. Repeat browser HEIC fallback and interrupted upload cancellation/retry on physical devices against `https://padel-hub-git-staging-zeyadkhaled2s-projects.vercel.app` (automated JPEG/PNG/WebP uploads, idempotency, ETag/304, Admin A/B/C, deletion guards, and revocation all passed on Vercel `fra1`).
3. Record initial dashboard usage baselines and follow 50/70/90% operator actions from [FREE_TIER_LAUNCH.md](FREE_TIER_LAUNCH.md).
4. Optional during pilot: Google OAuth (auto-surfaces once enabled) and Supabase HIBP leaked-password protection (currently flagged as `WARN` on Free tier).

### P2 — Post-Pilot Improvements (Strictly Out of Scope Before Pilot)
- Admin D–F (reports enhancements, analytics/audit log explorer, platform settings & operations UI).
- Automated self-service account deletion job.
- Reservations, swap cash-difference preference, featured listings / monetization, ratings/reviews, internal chat, and native mobile apps.

---

## 4. Physical-Device Launch Checklist (Owner Manual QA — Do Not Substitute Emulation)

Run these quick end-to-end checks on **physical devices** against the hosted target URL before inviting the first 10 sellers. (Detailed camera/memory/fallback media stress tests are in [MEDIA_PHYSICAL_DEVICE_CHECKLIST.md](MEDIA_PHYSICAL_DEVICE_CHECKLIST.md).)

### iPhone — iOS Safari (Latest iOS)
- [ ] **Signup & email confirmation**: register with a real inbox, open the bilingual Raketna confirmation email in Apple Mail / Gmail iOS, confirm redirect lands on `/en/account` or `/ar/account` signed in cleanly.
- [ ] **Profile & WhatsApp setup**: create profile, enable public visibility + WhatsApp consent, verify `/@username` opens cleanly and QR PNG downloads.
- [ ] **HEIC photo upload (3–4 real camera photos)**: select 3–4 default `.HEIC` camera photos (portrait + landscape), confirm upright orientation, smooth upload (`<= 4 MB`), and 0 crashes; toggle Airplane Mode mid-upload on 1 photo, reconnect, tap **Retry**, and confirm no duplicate attachment.
- [ ] **Submit & buyer WhatsApp check**: approve via admin (using TOTP authenticator), open the live listing anonymously in Private Safari, inspect gallery swipe, tap **Contact on WhatsApp**, confirm WhatsApp app opens with the pre-filled Arabic/English message and correct seller number.
- [ ] **Arabic RTL + Dark mode**: switch to `العربية` + Dark theme on `/`, listing detail, `/@username`, `/privacy`, `/terms`, and `/account` — verify zero horizontal overflow and readable contrast.

### Android — Chrome on Android (Mid-Range Phone)
- [ ] **Password recovery**: trigger `/ar/auth/forgot-password`, open email on Android, reset password, confirm old password fails and new password works.
- [ ] **4-photo camera burst & HEIC fallback**: upload 3–4 real phone camera photos (plus 1 `.HEIC` file if available to confirm lazy `/vendor/libheif/libheif-bundle.mjs` conversion), cancel mid-upload, tap **Retry**, verify exact saved count.
- [ ] **Buyer discovery & WhatsApp**: search/filter by governorate + category (including EU shoe size), open listing & seller storefront, tap **Contact on WhatsApp**, confirm Android WhatsApp opens cleanly.
- [ ] **Account deletion request**: on a synthetic test account, submit `/ar/account#account-deletion`, confirm `/@username` and listing immediately return `404`.

| Device & Browser | OS Version | Tested URL | Result | Notes |
| --- | --- | --- | --- | --- |
| iPhone — iOS Safari | Pending | Pending | Not tested | |
| Android — Chrome | Pending | Pending | Not tested | |

## PR #14 review corrections — 2026-11-26

- Migration 031 serializes account deletion with owner profile/listing/media mutations using the Auth row, including accounts without profiles. Pending requests reject profile creation/republication/contact consent and new listing/media mutations; status, reads and sign-out stay accessible. Saved records remain until authorized operator deletion.
- Operator removal takes the same account lock first; upload ingress must be paused/drained and a durable Storage-key manifest saved before database deletion. Local integration verifies failed Storage removal after DB commit, manifest-based retry and repeated removal.
- Recovery now fails on pg_restore errors, retains owners/grants/policies and compares the complete security catalog. Both full archive restoration and migration-based reconstruction are exercised locally, with anonymous/owner/admin authorization checks. The new hosted platform still needs its own authorized recovery rehearsal.
- No new feature, hosted migration, purchase, deployment or merge is part of these corrections. The six P0 owner actions above remain; optional indexing/Google OAuth are not launch blockers. Exact local test results are recorded in PROGRESS.md.
