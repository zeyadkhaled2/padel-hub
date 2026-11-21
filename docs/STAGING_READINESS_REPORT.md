# PadelHub — Hosted Staging Readiness Report (Phase 2A)

Date: 2026-11-21  
Branch: `chore/hosted-supabase-staging`  
Target environment: `padelhub-staging` (`ref: sxghreukdkxclymysryp`, `eu-central-1` / Frankfurt, `Ziad's org`, Free plan)

## 1. What Was Configured

- **Isolated Supabase staging project**: Created `padelhub-staging` (`https://sxghreukdkxclymysryp.supabase.co`, PostgreSQL 17.12) in `Ziad's org` (`szirscrrgswbwhhcgepe`), completely separate from local Docker (`padelhub-local`) and any future production project.
- **Database schema & migrations**: Applied all 18 existing migrations plus forward-only migration `019` (`20261121001900_hosted_auth_claim_helpers.sql`), with historical migration `006` cleanly recorded as superseded via `supabase migration repair --status applied 20261117000600` (zero historical migrations rewritten; database never reset). All 20 domain tables verified with `ENABLE` and `FORCE ROW LEVEL SECURITY`, zero direct `anon`/`authenticated`/`PUBLIC` table grants, all 7 `padelhub_*` roles `NOLOGIN NOINHERIT NOBYPASSRLS`, and zero `public`/`private` RLS policies touching `auth.*` directly.
- **Authentication**: Verified `mailer_autoconfirm = false` (email confirmation enforced), `anonymous_users = false`, `email = true`, App Authenticator **TOTP MFA** enabled (free on all Supabase plans), Site URL set to `http://127.0.0.1:3100`, and exact EN/AR callback Redirect URLs (`http://127.0.0.1:3100/en/auth/callback`, `http://127.0.0.1:3100/ar/auth/callback`) allowlisted.
- **Private Storage**: Provisioned `media-private` bucket (`public = false`, `file_size_limit = 8388608`, `allowed_mime_types = ['image/webp']`) with zero public/`anon`/`authenticated` Storage policies.
- **Application environment hardening & tooling**:
  - Hardened server-only env parsing in `src/server/supabase/env.ts`, `config.ts`, `clients.ts`, and `src/features/photos/server.ts` (strict origin normalization, HTTPS enforcement for remote Supabase URLs and non-loopback application origins, fail-closed rejection of swapped/identical publishable and secret keys, zero fallback to `NEXT_PUBLIC_*` or `SUPABASE_*`).
  - Added safe template `.env.example`, unit tests (`tests/unit/supabase-config.test.ts`, `tests/unit/staging-scripts.test.ts`), hosted-mode SQL tests (`supabase/tests/hosted-auth-helpers.test.sql`), non-destructive staging tooling (`scripts/staging-env.mjs`, `scripts/staging-app.mjs` with an independently pinned approved staging project ref, DB URL project-ref validation, explicit `--confirm-repair=<ref>:<version>` confirmation for migration-history repairs, and fail-closed mandatory admin MFA smoke verification), and runbook (`docs/STAGING_SETUP.md`).

## 2. What Was Tested

- **Hosted staging non-destructive smoke & security suite** (`node scripts/staging-app.mjs smoke` + `verify-revoked-admin` against local production Next.js connected to `padelhub-staging`): **19/19 smoke checks + 1/1 immediate revocation check passed (0 failed, 0 skipped)**:
  - Auth settings fail-closed check, unverified login rejection (API + UI), verified login, `httpOnly` + `SameSite=Lax` cookies, `no-store` headers, session reload persistence, token refresh, logout invalidation, and callback open-redirect rejection (`?next=https://evil.example` ignored).
  - Direct anonymous PostgREST table read denial & restricted RPC denial, cross-account RLS isolation, optimistic concurrency `PT409` rejection.
  - Private Storage upload (JPEG with EXIF + PNG), malformed (`400`), stale version (`409`), oversized `>8 MiB` (`413`), concurrent upload race (`[201, 409]`), replacement, hash-verified WebP delivery with EXIF stripped, Range (`416`), anonymous/cross-account `404`, and **direct hosted Storage public & cross-user URLs denied**.
  - Real hosted **TOTP MFA enrollment & `aal2` elevation**, `aal1` admin photo proxy fail-closed, EN/AR admin review & photo proxy at `aal2`, rejection with owner-visible reason, resubmission, approval, EN desktop & AR 390px mobile public detail visibility (zero overflow), approved public photo delivery, server-checked WhatsApp `302` redirect, abuse report submission & MFA-admin dismissal, listing withdrawal immediately blocking detail/contact/photo (`404`), and **immediate admin role revocation** denying both `aal2` API calls (`42501`) and live browser sessions (`404`).
  - All temporary test admin roles were revoked (`is_revoked = true`), all synthetic smoke listings were left cleanly in `draft` (0 active/pending public noise), and temporary `.cache/staging-admin-smoke.json` was removed.
- **Supabase Advisors on `padelhub-staging`**: 0 `ERROR`-level security issues; 0 mutable-search-path warnings; 0 `rls_disabled_in_public` warnings.
- **Local verification suites** (run after clean `npm ci`):
  - `npm ci`: passed (438 packages installed cleanly from lockfile).
  - `npm run check`: passed (`eslint .`, `next typegen && tsc --noEmit`, `next build --webpack` 23/23 routes).
  - `npm run test:unit`: **37/37 passed** (including server-only Supabase env-hardening tests in `tests/unit/supabase-config.test.ts` and staging CLI guard regression tests in `tests/unit/staging-scripts.test.ts`).
  - `npm run test:db`: **574/574 SQL assertions passed** across 15 SQL test files (including 20 new hosted-mode simulation assertions in `supabase/tests/hosted-auth-helpers.test.sql` with zero writer `auth` schema USAGE) plus all **14 concurrency/lock/isolation races**; scratch DB removed; local Studio DB untouched.
  - `node scripts/local-app.mjs test --workers=1` (against `node scripts/local-app.mjs serve` and local Supabase): **18/18 passed (0 failed, 0 skipped)** across desktop & mobile (`account.spec.ts`, `admin.spec.ts`, `foundation.spec.ts`, `media-boundary.spec.ts`, `shoe-search.spec.ts`).

## 3. Manual Owner Actions Needed

- Keep `e:\projects\padelHub\.env.staging.local` strictly local (already ignored by `.gitignore` and `.vercelignore`).
- When ready to test manual moderation on staging yourself, sign up/confirm your own staging operator account and grant its UUID in `private.admin_roles` via SQL Editor (never via UI or user metadata).
- If/when deploying a dedicated staging web URL (Vercel Preview branch or Railway Node host), add the 4 server-only `PADELHUB_*` variables (never `PADELHUB_STAGING_DB_URL`), update `PADELHUB_APP_ORIGIN`, and add `<staging-origin>/en/auth/callback` & `<staging-origin>/ar/auth/callback` in Supabase Auth Redirect URLs.

## 4. Unresolved Blockers & Known Scope Limits

- **No Phase 2A blockers remain for the staging Supabase foundation.**
- **External transactional email (Phase 2B)**: Supabase Free built-in email is rate-limited (~2 emails/hr) and unsuitable for real users. External signup confirmation and password-recovery email delivery have **not** been tested yet and must not be claimed as working until Resend custom SMTP is configured and verified in Phase 2B.
- **Hosted staging web app deployment (Step H)**: Per owner authorization, staging verification ran against a local production Next.js server (`http://127.0.0.1:3100`) connected to hosted `padelhub-staging` so the existing Vercel `main` preview (`padel-hub-beta.vercel.app`) remained untouched.
- **Backups & restore drill (Phase 2D)**: Free plan has no automatic backups/PITR and database backups do not include Storage objects.

## 5. Security Findings

| Severity | Finding | Reproduction | Status / Remediation |
| --- | --- | --- | --- |
| **Medium** (Operational) | Vercel Serverless Functions enforce a **4.5 MB** HTTP request body limit (`413`), while `POST /api/listings/[listingId]/photos` permits raw images up to **8 MiB**. | Deploy app to Vercel Hobby and upload a 5–8 MiB image through `/api/listings/[id]/photos`. | Documented in `docs/STAGING_SETUP.md`. Either host Next.js on a Node server (e.g., Railway) or cap/pre-resize uploads <= 4 MB before Vercel launch. |
| **Low** | `/api/admin/listings/[id]/photos/[media]` returns HTTP `503` (instead of `404`) when an `aal1` or non-admin caller hits Postgres `42501`. | Request `/api/admin/listings/<pendingId>/photos/<assetId>` with an `aal1` admin cookie. | Fails closed with zero image bytes leaked; consider mapping `42501` to `404` in a small follow-up so denial does not look like backend outage. |
| **Low** (Fixed) | Initial `scripts/staging-app.mjs` used `execFileSync`, whose error stack echoed `--remote=<db-url>` when the sandboxed CLI failed. | Trigger non-zero exit in `execFileSync` with DB URI argument. | **Remediated** immediately in `scripts/staging-app.mjs` via redacted `spawnSync` (zero credential output on failure); staging DB password rotated by owner. |
| **Low** (Operational) | Supabase Free project pauses after 7 days of inactivity and limits built-in auth emails (~2/hr). | Leave staging idle > 7 days or send > 2 auth emails/hr. | Acceptable for Phase 2A staging only; upgrade/custom SMTP required before real-user pilot (Phase 2B/2D). |
| **Info** | Supabase Performance Advisor flags 2 `multiple_permissive_policies` warnings (`padelhub_review_writer` on `private.audit_logs` INSERT and `public.seller_profiles` UPDATE) and 6 `INFO` `rls_enabled_no_policy` default-deny tables. | Run `get_advisors` on `padelhub-staging`. | Default-deny tables are intentional; policy consolidation is optional low-priority cleanup. |

## 6. Deployment & Rollback Procedures

Documented in full in [STAGING_SETUP.md](STAGING_SETUP.md), including fresh hosted staging bootstrap (`migrate-dry-run` → `migrate` → `repair-006` → `migrate`), verification checklists, safe application rollback (noting explicitly that **code rollbacks never revert database migrations**), forward-only migration failure recovery, credential revocation, and Phase 2D backup/restore prerequisites.

## 7. Actual Hosting Costs & Assumptions

- **Supabase (`padelhub-staging`, `Ziad's org`, Free plan)**: **\$0/month** (within 2-project Free allowance; TOTP MFA included free; 500 MB DB, 1 GB Storage, 5 GB egress, 50k MAU).
- **Vercel Hobby (`padel-hub-beta.vercel.app`)**: **\$0/month** (untouched in Phase 2A).
- **Total incremental Phase 2A cost**: **\$0/month** (within the approved \$5–15/month early budget in `docs/PRODUCT_PLAN.md`).
- **Expected later-phase costs (for planning only, not provisioned)**: Resend Free tier (\$0/mo up to 3,000 emails/mo, 100/day) in Phase 2B; optional Railway Node hosting (~\$5/mo) if full 8 MiB server-side photo uploads are kept; Supabase Pro (\$25/mo) if/when inactivity pause or managed backups/PITR become required.

## 8. Readiness for Phase 2B

**Phase 2B application code, password recovery, OAuth integration, email templates, and admin MFA recovery procedures are implemented and verified against `padelhub-staging`; external provider credentials remain owner-blocked.**

### 8.1 Recovery-session isolation fix (PR #4 review, 2026-11-21)

**Finding (High, fixed before merge):** The original recovery gate depended on an auxiliary `padelhub_recovery_uid` cookie. A valid recovery link created a fully authenticated Supabase session, so (a) an invalid follow-up `/auth/recovery` request cleared the cookie without revoking the session, (b) the cookie expired after 15 minutes while the session stayed valid, (c) protected photo handlers called `auth.getUser()` directly without the guard, and (d) the recovery JWT could call owner/admin RPCs directly through PostgREST. A recovery `token_hash` was also accepted by `/auth/callback?type=email` (empirically verified: GoTrue accepts recovery hashes as `type=email`).

**Fix — server-side boundary independent of cookies:**
- **PostgreSQL** (migrations `20261121002000_recovery_session_isolation.sql`, `20261121002100_force_rls_confirmed_signup_sessions.sql`): `private.verified_auth_caller()`, used by every owner/admin RPC, now also requires `private.is_active_account_session()`. It accepts signed JWT `amr` containing a primary method (`password`/`oauth`/`sso/saml`/`webauthn`) and no OTP/recovery method. OTP-only sessions (recovery, including MFA-elevated `aal2` `[otp, totp]`) are denied by default. The only exception is one genuine first-time signup-confirmation session per user, recorded server-side in `private.confirmed_signup_sessions` (`ENABLE` + `FORCE RLS`, no grants) via a `service_role`-only RPC. That RPC refuses accounts with `recovery_sent_at` set and stops working as soon as the `auth.sessions` row is gone.
- **Next.js:** `verifiedUserClient()` classifies the verified session's `amr` and fails closed. Photo upload, owner photo delivery and admin review-photo delivery now go through `verifiedUserClient()`. The `padelhub_recovery_uid` cookie has been removed completely.
- **Callbacks:** `/auth/callback` rejects `type=email` and signs out any OTP session it cannot allowlist. An invalid, expired or reused `/auth/recovery` request now signs out any existing restricted session.

### 8.2 Verification (rerun 2026-11-21)
- `npm run test:db`: **607/607 SQL assertions** across 16 files, including the new `recovery-isolation.test.sql` (33 assertions: privileges, password/OAuth allowed, OTP/recovery/magiclink/mixed/empty-amr denied for reads and owner mutations, MFA `aal2` recovery denied admin RPCs, single-use signup allowlist, session-deletion revocation), plus all 14 concurrency races.
- `npm run test:unit`: 38/38 passed (adds `classifySessionAmr`, `extractJwtSessionId`, `type=email` rejection).
- `npm run lint`, `npm run typecheck`, `npm run build` (27/27 routes): passed.
- Hosted `node scripts/staging-app.mjs smoke-phase2b`: **13/13 passed** on `padelhub-staging`, covering:
  - first-time signup allowlist
  - cross-type `type=email`/`type=signup` replay rejected
  - recovery session denied on account pages, private photo delivery (`404`), photo upload (`401`), owner mutations and direct RPCs (`42501`)
  - the boundary still holds after cookie removal, expiry simulation and Supabase token refresh
  - an invalid-token retry revokes the active recovery session
  - full EN desktop and AR mobile recovery with profile and photo preserved
  - an MFA-enrolled admin is denied at **both `aal1` and `aal2`** on `/admin`, admin review photos and admin RPCs, including after refresh and invalid retry
  - factor preserved after reset
  - operator `deleteFactor` followed by fresh re-enrollment
- `verify-revoked-admin`: 1/1 passed.

### 8.3 Still blocked pending owner external service configuration
See [AUTH_DEPLOYMENT_RUNBOOK.md](AUTH_DEPLOYMENT_RUNBOOK.md):
1. **Resend custom SMTP and DNS:** **BLOCKED / not verified.** Needs a verified sending domain (SPF/DKIM/DMARC), link/open tracking disabled, SMTP credentials in the Supabase Dashboard, and a real external inbox confirmation and recovery test.
2. **Google Cloud OAuth and staging Redirect URLs:** **BLOCKED / not verified.** Needs a Google Cloud Web OAuth Client (`openid email profile`), Google enabled in Supabase, `/en/auth/recovery` and `/ar/auth/recovery` allowlisted, and live Google sign-in tests (new user, linked verified user, repeat user, admin MFA check). Note: Google sessions carry `amr = oauth` and are accepted as primary sessions by the new boundary. This is covered by SQL tests but not yet by a live Google login.
