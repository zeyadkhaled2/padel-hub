# PadelHub — Hosted Staging Setup, Deployment & Rollback Runbook

Last updated: 2026-11-21. Scope: **Phase 2A (Isolated Hosted Supabase Staging)**. This is staging infrastructure preparation, not a public production launch.

## 1. Environment Identity & Isolation

- **Staging Supabase project**: `padelhub-staging` (`ref: sxghreukdkxclymysryp`, region `eu-central-1` / Frankfurt, `Ziad's org`, Free plan).
- **Local Supabase project**: `padelhub-local` (Docker, completely unlinked and untouched by staging tooling).
- **Production Supabase project**: Not yet provisioned (must be created as a separate isolated project before launch; never share credentials or databases across local, staging, and production).
- **Cost & plan assumptions**:
  - Supabase Free plan: **\$0/month** (up to 2 active projects, 500 MB database, 1 GB file storage, 5 GB egress, 50,000 MAU, **App Authenticator TOTP MFA included free**). Auto-pauses after 7 days of inactivity; built-in auth email is development rate-limited (~2 emails/hr) — external transactional SMTP (Resend) belongs to Phase 2B.
  - Existing Vercel Hobby workspace (`padel-hub-beta.vercel.app`): **\$0/month** (left untouched on `main`).

## 2. Required Environment Variables

See [.env.example](../.env.example). All four application variables are **server-only** and parsed by `src/server/supabase/env.ts` & `src/server/supabase/config.ts` with fail-closed validation (no fallback to `NEXT_PUBLIC_*` or generic `SUPABASE_*` variables, rejects swapped/identical publishable and secret keys, enforces HTTPS for remote Supabase URLs and non-loopback application origins):

| Variable | Scope | Purpose |
| --- | --- | --- |
| `PADELHUB_SUPABASE_URL` | Server-only runtime | Base HTTPS origin of the staging Supabase project (e.g. `https://<ref>.supabase.co`, no path/trailing slash). |
| `PADELHUB_SUPABASE_PUBLISHABLE_KEY` | Server-only runtime | Publishable (`sb_publishable_...`) or legacy `anon` JWT key for anonymous/session clients. Never place a secret key here. |
| `PADELHUB_SUPABASE_SERVICE_ROLE_KEY` | **Server-only secret** | Secret (`sb_secret_...`) or legacy `service_role` key used exclusively server-side for private Storage uploads/downloads, consented WhatsApp redirects, and best-effort analytics. **Never** place in `NEXT_PUBLIC_*`, client components, build logs, or git. |
| `PADELHUB_APP_ORIGIN` | Server-only runtime | Canonical origin of the staging web app (no trailing slash; HTTPS required for non-loopback hosts, HTTP allowed only for `127.0.0.1` / `localhost` / `[::1]`), used for Auth `emailRedirectTo`, `secure` cookie flags, and `Origin` checks. |
| `PADELHUB_STAGING_DB_URL` | **Operator-only CLI** | Session Pooler or direct `postgresql://...` URI used only locally/CI to push migrations via Supabase CLI. `scripts/staging-env.mjs` independently pins the approved staging project ref (`APPROVED_STAGING_PROJECT_REF = 'sxghreukdkxclymysryp'`), and `scripts/staging-app.mjs` validates that both `PADELHUB_SUPABASE_URL` and `PADELHUB_STAGING_DB_URL` match that pinned ref before running any staging operation. **Do not** add this to Next.js app runtime or Vercel env vars. |

For local staging testing, keep values only in gitignored `.env.staging.local` (ignored by `.gitignore` and `.vercelignore`). Never commit real secrets.

## 3. Setting Up a Fresh Hosted Staging Project

1. **Create an isolated Supabase project** in the target organization (recommended region `eu-central-1` for lowest latency to Egypt) and store the database password securely.
2. **Configure Authentication** (`Authentication` → `URL Configuration` & `Providers`):
   - Keep **Email** enabled with **Confirm email** ON (`mailer_autoconfirm = false`).
   - Keep **Anonymous sign-ins** OFF (`anonymous_users = false`).
   - Keep **App Authenticator (TOTP MFA)** enabled (free on all Supabase plans; leave paid Phone/SMS MFA disabled).
   - Set **Site URL** to your exact staging `PADELHUB_APP_ORIGIN` (e.g. `http://127.0.0.1:3100` for local staging verification, or `https://<staging-origin>` when hosted).
   - Add exact **Redirect URLs**:
     - `<PADELHUB_APP_ORIGIN>/en/auth/callback`
     - `<PADELHUB_APP_ORIGIN>/ar/auth/callback`
     - `<PADELHUB_APP_ORIGIN>/en/auth/recovery`
     - `<PADELHUB_APP_ORIGIN>/ar/auth/recovery`
   - Do **not** add wildcard redirect URLs (`*`) or unapproved domains.
   - For custom SMTP (Resend), bilingual email templates (`supabase/templates/`), Google Cloud OAuth setup, and admin MFA recovery procedures, see [AUTH_DEPLOYMENT_RUNBOOK.md](AUTH_DEPLOYMENT_RUNBOOK.md).
3. **Provision the private Storage bucket**:
   - Run `node scripts/staging-app.mjs setup-bucket` (or create bucket `media-private` with `public = false`, `file_size_limit = 8388608`, `allowed_mime_types = ['image/webp']`).
   - Confirm `storage.objects` and `storage.buckets` have **zero** public/`anon`/`authenticated` policies; all media reads and writes happen strictly through server-only verified handlers (`/api/listings/[listingId]/photos`, `/api/media/[mediaId]`, `/api/admin/listings/[id]/photos/[media]`).
4. **Apply database migrations** (see Section 4).

## 4. Applying & Verifying Database Migrations

All migrations live in `supabase/migrations/` (`001` through `019`). Always test new migrations locally first via `npm run test:db` (disposable scratch database) — **never run destructive database tests (`npm run test:db`) against hosted staging**.

### Hosted Bootstrap Procedure (Fresh Project)

On hosted Supabase Postgres 17, schema `auth` is owned by `supabase_admin` (inaccessible to customers), and `postgres` holds `USAGE` on `auth` without `WITH GRANT OPTION`. Historical migration `20261117000600_auth_schema_capabilities.sql` (`006`) asserts direct `USAGE ON SCHEMA auth` on the three writer roles and therefore fails cleanly on a fresh hosted project (`SQLSTATE P0001`). Forward-only migration `20261121001900_hosted_auth_claim_helpers.sql` (`019`) supersedes `006` without rewriting historical migration files by routing capability-role JWT/verified-user checks through narrow, parameterless `postgres`-owned `SECURITY DEFINER` helpers in `private`.

To bootstrap a brand-new hosted Supabase project cleanly using Supabase CLI (without linking the local repository):

> **Safeguard:** `scripts/staging-env.mjs` pins `APPROVED_STAGING_PROJECT_REF` (`sxghreukdkxclymysryp`) independently from `.env.staging.local` so staging commands refuse to target another project (such as production) even if both URLs are accidentally swapped. If provisioning a replacement staging project in the future, update `APPROVED_STAGING_PROJECT_REF` in a reviewed commit first. Migration-history repair also requires an explicit `--confirm-repair=<projectRef>:20261117000600` flag.

```bash
# 1. Inspect pending migrations (safe dry run)
node scripts/staging-app.mjs migrate-dry-run

# 2. Push migrations 001–005 (halts cleanly at 006 with SQLSTATE P0001 on fresh hosted projects)
node scripts/staging-app.mjs migrate

# 3. Record 20261117000600 as superseded by forward-only migration 019 (requires explicit confirmation)
node scripts/staging-app.mjs repair-006 --confirm-repair=sxghreukdkxclymysryp:20261117000600

# 4. Push migrations 007–019
node scripts/staging-app.mjs migrate
```

For subsequent incremental migrations on an already-bootstrapped staging project, only steps 1 and 4 are needed (`migrate-dry-run`, then `migrate`).

### Verifying Migration Success

1. Confirm all 19 versions (`20261116000100` .. `20261121001900`) appear in `supabase_migrations.schema_migrations`.
2. Verify schema invariants (read-only SQL):
   - All 20 tables in `public` and `private` have `ENABLE` and `FORCE ROW LEVEL SECURITY`.
   - Zero `public`/`private` RLS policies reference `auth.*` directly.
   - All 7 `padelhub_*` roles have `rolcanlogin = false`, `rolinherit = false`, `rolbypassrls = false`, `rolsuper = false`.
   - Zero direct `anon`, `authenticated`, or `PUBLIC` table grants exist on `public.*` or `private.*`.
   - Reference seed counts match (`platform_settings = 1`, `egypt_governorates = 27`, `curated_brands = 14`, reserved usernames `= 71`).
3. Run Supabase Security Advisors (`get_advisors` / Dashboard Advisors) and confirm zero `ERROR`-level security issues, zero mutable-search-path functions, and zero exposed `private` helpers.
4. Run the non-destructive hosted smoke suite (Section 5).

## 5. Running & Deploying the Staging Application

### Local Production Build Connected to Hosted Staging (Verified in Phase 2A)

```bash
npm run check
node scripts/staging-app.mjs serve
```

In a second terminal, run the non-destructive staging verification suite (uses synthetic users/images only, withdraws created listings, revokes any temporary test admin role):

```bash
# Required: create a temporary synthetic admin user (prints only userId; grant in private.admin_roles before smoke, then revoke)
node scripts/staging-app.mjs prepare-smoke-admin

# Run full non-destructive Auth, Storage, RLS, mandatory admin TOTP MFA, EN/AR, desktop/mobile smoke checks
# (fails fast with non-zero exit if admin MFA state is missing or private.admin_roles was not granted)
node scripts/staging-app.mjs smoke

# Run Phase 2B recovery, OAuth callback safety, and synthetic admin MFA recovery smoke checks
node scripts/staging-app.mjs smoke-phase2b

# Check non-secret staging Auth provider flags (confirmation enforced, email/google enabled)
node scripts/staging-app.mjs auth-status

# After revoking the temporary admin role in private.admin_roles:
node scripts/staging-app.mjs verify-revoked-admin
```

### Deploying to Hosted Staging (Vercel Preview or Dedicated Node Host)

- **Vercel Preview / Dedicated Staging Branch (`\$0/month` on Hobby)**:
  1. Do **not** alter `main` or production DNS. Create/select a dedicated staging branch or separate staging Vercel project.
  2. Set only the 4 server-only `PADELHUB_*` variables scoped to **Preview** (or the dedicated staging project), with `PADELHUB_APP_ORIGIN` matching the exact staging HTTPS origin.
  3. Add `<staging-origin>/en/auth/callback` and `<staging-origin>/ar/auth/callback` to `padelhub-staging` Auth Redirect URLs.
  4. Verify `robots: { index: false, follow: false }` remains active (`src/app/[locale]/layout.tsx`).
  5. **Platform limitation — Vercel 4.5 MB request body cap**: Vercel Serverless Functions reject request bodies above **4.5 MB** (`413 FUNCTION_PAYLOAD_TOO_LARGE`), whereas `POST /api/listings/[listingId]/photos` permits raw images up to **8 MiB**. Photos under ~4.5 MB work on Vercel; supporting 4.5–8 MiB uploads requires either a Node host (e.g. Railway `next start`, ~\$5/month) or a future direct-to-storage/client-resize upload change.

## 6. Safe Rollback & Incident Recovery Procedures

### Rolling Back Application Code
1. On Vercel: promote the previous known-good staging deployment from **Deployments** (or revert the Git commit via `git revert <sha>` and redeploy).
2. **Important:** **Rolling back application code does NOT revert database migrations.** Always design schema changes as forward-compatible (expand-and-contract) so the previous application build continues to function safely against the newer schema.

### Handling a Failed Forward-Only Database Migration
1. Every PadelHub migration runs inside a transaction (`BEGIN; ... COMMIT;`), so a failed migration rolls back cleanly without corrupting earlier applied migrations.
2. **Never** delete or reset the staging database to bypass an error, and **never** silently edit a migration already applied to another environment.
3. Capture the exact PostgreSQL error and SQLSTATE, reproduce it against the local disposable scratch DB (`npm run test:db`), author a new forward-only migration (`supabase/migrations/<timestamp>_<fix>.sql`), verify `npm run test:db` passes, and push forward with `node scripts/staging-app.mjs migrate`.

### Revoking Compromised Staging Credentials
1. **API keys (`sb_secret_` / `service_role` / `sb_publishable_`)**: Immediately revoke/rotate in Supabase Dashboard (`Project Settings` → `API Keys`), update `.env.staging.local` and any staging host env vars, and redeploy/restart the staging server.
2. **Database password (`PADELHUB_STAGING_DB_URL`)**: Reset immediately in `Project Settings` → `Database` → `Reset database password` and update operator password storage.
3. **JWT signing keys / sessions**: Rotate JWT signing keys in `Project Settings` → `JWT Keys` (invalidating compromised tokens) and revoke active user sessions if needed.
4. **Admin account / TOTP compromise**: Immediately execute `UPDATE private.admin_roles SET revoked_at = now() WHERE user_id = '<uuid>';` (takes effect on the next RPC call even for existing `aal2` sessions) and unenroll compromised MFA factors.

## 7. Backup & Restore Readiness (Remaining for Phase 2D)

- Supabase Free plan does **not** include automatic daily backups or Point-in-Time Recovery (PITR).
- **Database backups do NOT include Storage object contents** (`media-private` WebP variants must be backed up separately to independent private storage).
- Before any real-user pilot (Phase 2D), establish:
  1. Automated daily encrypted logical database backups (`pg_dump`) retaining at least 7 daily copies.
  2. Separate private media backup/sync covering all `media-private` objects without ever deleting live user photos.
  3. A documented and executed restore drill verifying target RPO (24h) and RTO (1 working day).
