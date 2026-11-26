# Raketna — Backups, Restore Drill, Monitoring & Account Deletion Operations

Last updated: 2026-11-26
Scope: Practical, low-cost operational procedures for the controlled pilot (10 real sellers, 50–100 listings). No enterprise monitoring stack or background automation required.

---

## 1. Practical Backup Strategy (Database + Private Storage)

**Critical Supabase Free-tier facts:**
- Supabase Free (**\$0/month**, commercial use permitted) does **not** include automatic daily backups or Point-in-Time Recovery (PITR).
- **Database backups NEVER include Storage object contents.** `media-private` WebP photo variants must be backed up separately to independent private storage.
- Backup retention must **never** delete live seller photos.
- Recovery targets (per [PRODUCT_PLAN.md](PRODUCT_PLAN.md)): **RPO = 24 hours**, **RTO = 1 working day**.

### 1.1 Daily Database Backup (Logical `pg_dump`, 7 Daily Copies)
Run once daily (manually by the pilot operator or via a lightweight scheduled operator task) using the target project's direct/Session Pooler PostgreSQL URI (never stored in Git or app env vars):

```bash
# 1. Create compressed custom-format dump of application & auth schemas
pg_dump "$PADELHUB_TARGET_DB_URL" \
  --format=custom \
  --no-owner \
  --schema=auth \
  --schema=public \
  --schema=private \
  --file="raketna-db-$(date -u +%Y-%m-%d).dump"

# 2. Encrypt before copying off-host (keep decryption passphrase in password manager)
openssl enc -aes-256-cbc -pbkdf2 -salt \
  -in "raketna-db-$(date -u +%Y-%m-%d).dump" \
  -out "raketna-db-$(date -u +%Y-%m-%d).dump.enc"

# 3. Store the last 7 daily encrypted files in independent private storage
#    (e.g., private encrypted cloud drive or offline operator disk; remove local unencrypted .dump)
```

### 1.2 Private Media Backup (`media-private` Bucket)
Use the zero-dependency repository helper [scripts/backup-supabase.mjs](../scripts/backup-supabase.mjs), which reads `media-private` using server-only credentials, downloads every object, writes a SHA-256 `manifest.json`, and **never** deletes or mutates live Storage objects:

```bash
# Back up all media-private objects (use --staging for padelhub-staging, or set PADELHUB_SUPABASE_URL + PADELHUB_SUPABASE_SERVICE_ROLE_KEY for production)
node scripts/backup-supabase.mjs media-backup --staging --out .cache/backups/media-YYYY-MM-DD

# Independently verify every backed-up file matches its recorded byte size and SHA-256 digest
node scripts/backup-supabase.mjs media-verify --dir .cache/backups/media-YYYY-MM-DD
```

Archive the verified folder into an encrypted zip/tarball alongside the daily database dump in independent private storage (retain 7 daily copies). Because pilot volume is small (~50–100 listings × 3–4 photos × ~250–350 KB total across variants = ~50–140 MB), full daily snapshots take seconds and fit well within free personal/cloud storage.

### 1.3 Isolated Database & Media Restore Verification Procedure
Before onboarding real sellers—and monthly during the pilot—test recovery into an **isolated disposable database** (never overwrite a live environment during a drill):

```bash
# Local isolated dump -> restore -> row-count & FORCE RLS verification drill:
node scripts/backup-supabase.mjs db-drill-local

# Local media backup -> SHA-256 verification drill:
node scripts/backup-supabase.mjs media-backup --local --out .cache/backups/local-media-drill
node scripts/backup-supabase.mjs media-verify --dir .cache/backups/local-media-drill
```

To restore a hosted incident into a fresh Supabase project:
1. Create a clean replacement Supabase project (`eu-central-1`) and configure Auth settings (`mailer_autoconfirm = false`, `anonymous_users = false`, TOTP MFA enabled, exact Redirect URLs, Resend Custom SMTP) and private bucket `media-private` (`public = false`, `8388608` bytes, `image/webp`).
2. Decrypt the latest `.dump.enc` and restore schemas (`auth`, `extensions`, `public`, `private`) with `pg_restore --no-owner --no-privileges --dbname="$NEW_DB_URL" <dump>`.
3. Verify schema invariants (all domain tables have `FORCE ROW LEVEL SECURITY`, zero direct `anon`/`authenticated` table grants, expected `seller_profiles` / `listings` / `media_assets` counts).
4. Re-upload backed-up objects from the verified `media-backup` folder into `media-private` preserving exact `processed/<asset>/<attempt>/<variant>.webp` keys (`upsert: false`).
5. Point app runtime env vars (`PADELHUB_SUPABASE_URL`, `PADELHUB_SUPABASE_PUBLISHABLE_KEY`, `PADELHUB_SUPABASE_SERVICE_ROLE_KEY`) to the recovered project and run the non-destructive smoke check before reopening traffic.

---

## 2. Manual Account Deletion Operator Procedure (SQL-Verified)

Signed-in users submit authenticated deletion requests from `/[locale]/account#account-deletion` (`public.request_account_deletion`, migration `030`). Submitting immediately hides their public profile, `/@username` storefront, QR redirect, public listings, and WhatsApp contact while preserving rows and photos until the operator completes permanent removal within **7 days**.

> **Why deletion must follow this exact SQL order:** Three tables enforce `ON DELETE RESTRICT` against `public.media_assets` (`seller_profiles.avatar_media_id`, `public.listing_media`, and `private.photo_upload_idempotency`), and `public.listing_media` has a deferred `check_photo_count` trigger while parent `listings` rows exist. Calling `auth.admin.deleteUser(uid)` directly will fail with FK error `23503` until those references are cleared in the transaction below.

### Step 1 — Inspect Pending Deletion Queue
```sql
SELECT r.user_id, r.public_id, r.status, r.reason, r.requested_at, p.username, p.account_status
FROM private.account_deletion_requests r
LEFT JOIN public.seller_profiles p ON p.user_id = r.user_id
WHERE r.status = 'pending'
ORDER BY r.requested_at ASC, r.user_id ASC;
```

### Step 2 — Export All Storage Keys Owned by the Account (Before DB Deletion)
Save the returned `storage_key` list so Step 4 can delete every private file from `media-private`:
```sql
SELECT
  a.id AS asset_id,
  v.value->>'key' AS storage_key
FROM public.media_assets a
CROSS JOIN LATERAL jsonb_each(coalesce(a.ready_manifest, '{}'::jsonb)) AS v(variant, value)
WHERE a.owner_id = '<target-user-id>'
UNION ALL
SELECT a.id AS asset_id, a.private_storage_path AS storage_key
FROM public.media_assets a
WHERE a.owner_id = '<target-user-id>'
  AND a.ready_manifest IS NULL;
```

### Step 3 — Atomic Database Removal Transaction
Run as database operator (never via app capability roles). This clears `ON DELETE RESTRICT` references in dependency order, removes personal/account rows, preserves the append-only non-personal audit trail with a completion entry, and deletes the `auth.users` row (which cascades `seller_profiles`, `seller_contacts`, `username_registry`, `username_aliases`, `confirmed_signup_sessions`, `admin_roles`, `account_deletion_requests`, and nullifies `abuse_reports.reporter_user_id`):

```sql
BEGIN;
DO $$
DECLARE
  v_user_id uuid := '<target-user-id>';
  v_operator_id uuid := '<operator-user-id>';
  v_reason text := '<ticket-or-request-reference>';
  v_req private.account_deletion_requests;
  v_public_id uuid;
BEGIN
  SELECT * INTO v_req
  FROM private.account_deletion_requests
  WHERE user_id = v_user_id
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account deletion aborted: no pending request for user %', v_user_id
      USING ERRCODE = 'PT404';
  END IF;

  SELECT public_id INTO v_public_id
  FROM public.seller_profiles
  WHERE user_id = v_user_id
  FOR UPDATE;

  -- 1. Clear avatar FK (ON DELETE RESTRICT -> media_assets)
  UPDATE public.seller_profiles
  SET avatar_media_id = NULL
  WHERE user_id = v_user_id
    AND avatar_media_id IS NOT NULL;

  -- 2. Remove upload idempotency receipts (ON DELETE RESTRICT -> media_assets)
  DELETE FROM private.photo_upload_idempotency
  WHERE owner_id = v_user_id;

  -- 3. Remove listings first (cascades listing_media, listing_moderation_state,
  --    listing_daily_metrics, listing_engagement_counters, target listing reports)
  --    so check_photo_count never fires on orphaned active/pending rows.
  DELETE FROM public.listings
  WHERE seller_id = v_user_id;

  -- 4. Remove all owned media_assets rows (Storage objects removed in Step 4)
  DELETE FROM public.media_assets
  WHERE owner_id = v_user_id;

  -- 5. Remove per-user rate-limit window bucket if present
  DELETE FROM private.rate_limit_windows
  WHERE bucket_key = 'photo:' || v_user_id::text;

  -- 6. Record non-personal completion entry in append-only audit_logs
  INSERT INTO private.audit_logs (
    actor_user_id, actor_role, action, target_type, target_id, reason
  ) VALUES (
    v_operator_id,
    'admin',
    'account.deleted',
    'account',
    coalesce(v_public_id, v_user_id)::text,
    btrim(v_reason)
  );

  -- 7. Delete auth.users row (cascades seller_profiles, seller_contacts,
  --    username_registry, username_aliases, confirmed_signup_sessions,
  --    admin_roles, and account_deletion_requests)
  DELETE FROM auth.users
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account deletion aborted: auth.users row % not found', v_user_id
      USING ERRCODE = 'PT404';
  END IF;
END $$;
COMMIT;
```

### Step 4 — Delete Private Storage Objects & Verify Clean Removal
1. Using the Storage keys exported in Step 2, delete the objects from bucket `media-private` via Supabase Dashboard (`Storage → media-private`) or a one-off operator call to `serviceClient.storage.from('media-private').remove(storageKeys)`.
2. Verify zero remaining rows for `<target-user-id>` in `auth.users`, `public.seller_profiles`, `private.seller_contacts`, `public.listings`, `public.media_assets`, and `private.account_deletion_requests`.
3. Note: Previously downloaded buyer copies cannot be revoked remotely; non-personal append-only moderation entries in `private.audit_logs` remain intact (no email, phone, or password is stored there).

---

## 3. Practical Monitoring & Quota Watchbook (Existing Tools Only)

No custom dashboards, APM vendors, or alerting services are needed for 10 sellers and 50–100 listings. Check these built-in dashboards **once per day during pilot onboarding** (5 minutes):

| Signal | Where to check | What to look for & threshold |
| --- | --- | --- |
| **Application errors & slow routes** | Web host runtime logs (Vercel → *Logs* or Railway → *Deploy Logs / HTTP Logs*) | Any HTTP `500` / `503` spikes, unhandled Server Action exceptions, or `/api/listings/[id]/photos` timeouts. |
| **Photo upload & delivery telemetry** | Same web host logs — filter JSON lines containing `"event":"media.upload"` or `"event":"media.delivery"` | Repeated `"failureCategory":"storage"` or `"database"`, `"httpStatus":413` (payload over 4 MB), or `"httpStatus":429` rate-limit hits. Telemetry logs contain numeric/enum metrics only (zero PII or Storage keys). |
| **Database errors & Auth failures** | Supabase Dashboard → *Logs Explorer* (`Postgres`, `Auth`, `PostgREST`) | Auth SMTP send errors (`535`/`421`/timeout), repeated `42501` unexpected RPC denials, connection pool saturation, or slow query warnings. |
| **Storage failures** | Supabase Dashboard → *Logs Explorer* (`Storage`) | Failed object uploads (`5xx`) or integrity mismatch retries. |
| **Security advisors** | Supabase Dashboard → *Advisors → Security* | Must remain **0 `ERROR`-level** advisors after every migration. |
| **Quota pressure (70% warning rule)** | Supabase → *Project Settings → Billing / Usage* | **DB**: warn at `350 MB / 500 MB`. **Storage**: warn at `700 MB / 1 GB`. **Egress**: warn at `3.5 GB / 5 GB`. **MAU**: warn at `35k / 50k`. **Inactivity pause**: Supabase Free pauses after **7 consecutive days** with zero requests — daily admin/smoke traffic prevents pausing; if paused, restore in Dashboard or upgrade to Pro (\$25/mo). |
| **Transactional email quota** | Resend Dashboard → *Emails / Logs* | Warn at **70 emails/day** (Free cap 100/day, 3,000/mo), bounce rate `> 2%`, or any failed delivery status. |
| **Pending moderation & deletion queues** | `/[locale]/admin` + Step 1 SQL above | Review pending listings daily; process any open abuse reports and `private.account_deletion_requests` within 7 days. |
