# Local Supabase

Pinned CLI: 3.1.0. Project: `padelhub-local`. No hosted project is linked.

## Start and inspect

```powershell
npx supabase start --network-id padelhub-local-loopback --yes
```

Studio: http://localhost:54323. API: 54321. Database: 54322. Local mail inbox: http://localhost:54324. Keep Studio running during inspection. CLI status/startup can contain credentials; do not paste full output into logs or reports.

Use `npx supabase stop --project-id padelhub-local` only when a stop is intended; it preserves volumes. Never reset the user's database for tests. Do not use `--all` or `--no-backup`.

## Implemented migrations

Nineteen migrations are tracked in `supabase/migrations/` (`001`–`019`): schema, reference data, profiles, listing drafts/submission/withdrawal, MFA-admin review, local Auth-schema guard (`006`), synchronous equipment-photo save/delivery, owner listing index, public marketplace/contact projections, MFA-protected admin queue/photo access, seller lifecycle controls, public `/@username` profiles, QR public-ID redirects, shoes/bags categories, abuse reports, daily listing analytics, admin-only WhatsApp contact metrics, exact EU shoe-size search, and hosted Auth-claim helpers (`019`). Direct browser table writes remain denied on all 20 domain tables (`FORCE ROW LEVEL SECURITY`).

Migration 019 (`20261121001900_hosted_auth_claim_helpers.sql`) removes runtime dependency of the three least-privilege writer roles on direct `USAGE ON SCHEMA auth` (which `postgres` cannot delegate on hosted Supabase because `supabase_admin` owns `auth`) via narrow, parameterless `postgres`-owned `SECURITY DEFINER` helpers in `private`. See [STAGING_SETUP.md](../docs/STAGING_SETUP.md) for hosted staging setup, bootstrap (`repair-006` + `migrate`), verification, and rollback procedures.

Migration 007 replaced an **unapplied** queue/worker draft. It now contains direct photo-save and visibility functions, draft reads and a bounded upload rate counter. No worker leases, processing queue or scheduled cleanup is used. Existing future-use tables are retained without building services around them. See [photo flow](../docs/PHOTOS.md).

## Verify

```powershell
npm run test:db
npm run check
node scripts/local-app.mjs serve
```

In another terminal, `node scripts/local-app.mjs test --workers=1` runs browser checks with local Auth/Storage. The launcher prepares/checks the private local bucket and supplies credentials only in memory. It preserves `.env.local`. No hosted fallback is used.

The database runner creates a random `padelhub_test_<hex>` database, copies the vendor Auth schema without data, replays migrations, runs transactional tests and removes only its own scratch database. It also checks installed Auth-schema privileges, which a scratch schema's different ownership could otherwise mask. Current SQL suite: 574 assertions across 15 SQL test files (including hosted-mode simulation without writer `auth` schema USAGE) plus 14 concurrency/isolation checks. The old `padelhub_t02b_test` schema-only debugging database is not the current test baseline; it is left untouched.

## Auth grant prerequisite

This local image's Auth schema belongs to `supabase_admin`. Normal `postgres` migration execution cannot delegate its USAGE privilege. Historical migration `006` fails explicitly if the profile/listing/review writer roles lack it. On a fresh local installation, after 001–005 create the roles, apply the reviewed 006 SQL through:

```powershell
Get-Content supabase/migrations/20261117000600_auth_schema_capabilities.sql -Raw | docker exec -i supabase_db_padelhub-local psql -X -v ON_ERROR_STOP=1 -U supabase_admin -d postgres
npx supabase migration up --yes
```

A failed 006 transaction leaves earlier migrations intact. On hosted Supabase (where `supabase_admin` is inaccessible to customers), forward-only migration `019` (`20261121001900_hosted_auth_claim_helpers.sql`) supersedes `006`; see [STAGING_SETUP.md](../docs/STAGING_SETUP.md) for the exact hosted bootstrap (`repair-006` + `migrate`) and verification procedure.

Email confirmation is enabled. Use http://127.0.0.1:3100 with its exact EN/AR callback URLs. Emails go to the local inbox, not external recipients. Google OAuth, password recovery and hosted SMTP are not configured.

## Remaining local limitations

The documented network option did not restrict Docker's published ports: all-interface bindings were observed. Use synthetic data until a scoped loopback remedy is verified. No global firewall/daemon changes were made. Original Auth container `supabase_auth_padelhub-local_before_t03` remains stopped for rollback; do not run it alongside the current Auth container.

Saved photos are retained. Interrupted/conflicting uploads can leave private unreferenced objects for manual review; no automatic deletion or physical-erasure guarantee. Replaced files remain private and count toward the account's retained-photo allowance. Hosted limits and backups must be checked before launch.

Admin setup and review contracts: [ADMIN_REVIEW.md](../docs/ADMIN_REVIEW.md). TOTP is enabled locally; the pre-MFA Auth container remains stopped for rollback.
