# Admin review

## Use locally
1. Sign in with the account explicitly approved for admin access, then open `/en/admin` or `/ar/admin`.
2. On first use, add the displayed setup key to an authenticator app as a time-based account and enter its six-digit code. Keep the key private. Later password sign-ins require a fresh authenticator verification.
3. Open a pending listing, review its details and every photo (click for full size), then approve or reject with a reason. Owners see rejection reasons in their listing editor.

Access is granted only through `private.admin_roles` by an authorized database operator, never through profile/account type or user-editable metadata. A public seller profile is not required for an admin. All queue, photo and decision RPCs require an active role and `aal2`; revoked roles fail immediately. Stale decisions require reload and review. Photos use a private no-store proxy with permission checks before and after download.

## Changing the admin account & MFA recovery
Register and verify the replacement account, then have the operator grant its UUID the admin role. Confirm its MFA sign-in works before setting the old row's `revoked_at = now()`. Do not transfer another person's authenticator secret or reuse an old account's session. No self-service role changes or MFA recovery bypass exists in the app. Password recovery on an MFA-enrolled admin enforces TOTP (`aal2`) before updating the password, never removes the MFA factor, and signs out existing sessions globally. Full operator recovery procedures (lost/compromised device, locked-out admin, compromised account, two-person approval, and Auth Admin MFA factor deletion) are documented in [AUTH_DEPLOYMENT_RUNBOOK.md](AUTH_DEPLOYMENT_RUNBOOK.md).

TOTP is enabled in local `supabase/config.toml` and the running Auth container. The previous Auth container is retained stopped as `supabase_auth_padelhub-local_before_mfa_20261118`; do not run it alongside the current Auth container. Database and saved media were preserved. Hosted configuration and recovery procedures remain launch work.

## Existing contracts
- `get_my_admin_access()`: current verified account's role/MFA flags only.
- `admin_dashboard_overview()`: aggregated, MFA-enforced (`aal2` + active `private.admin_roles`) overview KPIs, needs-attention summary, 7-day/30-day UTC trends, daily engagement counters, and up to 12 privacy-safe recent listing/moderation audit entries (column-level `SELECT` on `private.audit_logs` excluding `actor_user_id`, `before_state`, and `after_state`).
- `admin_pending_listings(page)`: 24 pending summaries, oldest first, total count.
- `admin_get_listing_review(id)`: exact listing/profile versions and media manifest for decisions.
- `admin_approve_listing` / `admin_reject_listing`: existing transactional decisions; never replace the reviewed snapshot with a freshly fetched one when submitting.
- `admin_photo_delivery(listing, asset)`: MFA-authorized current attachment across all lifecycle states (migration 028); storage keys stay in the server response pipeline.
- `get_my_listing_decision(id)`: owner-only rejection reason.

## Prompt for the UI agent
Refine the existing functional admin UI in `src/features/admin`, not a new dashboard framework. Read PROGRESS.md, DESIGN_SPEC.md and the calm-nextjs-design skill. Preserve bilingual EN/AR, RTL, light/dark themes, mobile layouts, noindex/no-store behavior and the existing Server Actions/RPCs. Prioritize a clear pending queue, readable listing/profile eligibility details, inspectable photos, and distinct approve/reject actions with required rejection reasons. Preserve MFA, revocation checks, stale-review handling and typed reasons on errors. Never expose storage keys, phone numbers or authenticator secrets in logs/screenshots; never grant roles through the UI. No analytics charts or speculative services. Run `npm run check` and local browser tests, record a short result in PROGRESS.md, and provide a small before/after explanation of components changed. Do not publish without authorization.

## Verification boundaries
Admin browser tests use synthetic verified account fixtures and real TOTP enrollment/challenge/verification. Email confirmation is covered separately by account tests. Test reviewer roles are revoked and active/pending fixture listings withdrawn afterward; saved images are retained. Screenshots cover verified review pages only. No hosted MFA, account recovery or production deployment is claimed.

## Content reports
`/admin/reports` uses the same active-role and MFA checks. Verified users may report public content (five per rolling 24 hours, one open report per target). Admins dismiss, remove a listing, or suspend a profile with a required note. Both report and target versions must match; reload conflicts instead of resubmitting with new versions automatically. Notes allow 1,000 characters. Saved photos remain intact. Restoration and appeal UI are not implemented yet.

## Admin B — Listing management (2026-11-26)

`/[locale]/admin/listings` is the dedicated inventory workspace. The overview remains available; its pending indicators open `?status=pending&sort=pending`. Inventory is rendered on the server, 24 rows per page, using bounded validated URL parameters (`q`, `status`, `category`, `account`, `governorate`, `sort`, `page`). Search is literal, case-insensitive text across title/brand/model/seller display name/username, or exact listing UUID. Counts above the filters describe the whole inventory; the result count describes the active filters. Applying filters resets pagination. Every ordering ends in a UUID tie-breaker. Oldest-pending sorting puts pending submissions first, then other states by creation time.

Lifecycle status and public visibility are separate. `active` alone never guarantees publication: inspection uses the existing `private.market_visible` predicate, including exact approved content/media and current profile/contact eligibility. Reserved, sold and traded listings can have public detail pages even though they are absent from active marketplace search.

New migration `028` contracts:
- `admin_listing_inventory(query, status, category, account_type, governorate, sort, page)`: privacy-safe summaries, total filtered count and global status counts. No contacts, auth details or Storage keys.
- `admin_listing_inspection(listing_id)`: reuses `admin_get_listing_review` and adds timestamps, current public eligibility, and the latest approved/rejected/removed/report-removal audit summary. It deliberately excludes audit actor identity and raw before/after states. Exact manifests remain server-only in encrypted action closures.
- `admin_remove_listing(listing_id, expected_listing_version, expected_content_version, expected_profile_version, reviewed_manifest, reason)`: only currently public listings; READ COMMITTED; required 1–1,000-character reason; profile/listing/media locks and exact snapshot checks; atomic removed status plus one `listing.removed` audit record. No manufactured report. It retains prior approval history and all media. There is no restoration control.
- `admin_photo_delivery` now permits current, owned, ready listing-photo attachments in every lifecycle state. The existing private proxy still checks active admin role and MFA before and after Storage retrieval, verifies hashes, and returns no-store with no ETag/304. Inventory requests 320px thumbnails; review requests card previews and offers full-size links. Unavailable images have a fallback.

All new RPCs are owned by the existing NOLOGIN/NOINHERIT/NOBYPASSRLS review capability, with an empty search path, authenticated EXECUTE only, and the existing verified-account/active-role/aal2 gate. No new tables, table grants, indexes, dependencies or service-role query shortcuts. Pilot-scale bounded substring scanning reuses existing listing/profile/media indexes; revisit indexing only after measuring real volume.

Pending approval/rejection still calls the original RPCs with the exact reviewed snapshot. Conflicts disable resubmission until explicit reload. Read-only nonpublic draft inspection can omit invalid/unavailable asset manifests with a notice; pending/public decision snapshots never use that fallback. Filters are preserved through validated internal return links.

Apply 028 after 027 before serving this app version. This session applied 028 locally only. Hosted migration 027 verification, owner-authorized hosted 028 migration/smoke testing, physical-device media checks, and the other pilot release gates remain outstanding. See PROGRESS.md for exact local results. Admin C–F are separate phases.

## Admin C — Seller management and listing allowances (2026-11-26)

`/[locale]/admin/sellers` and `/[locale]/admin/sellers/[id]` provide the MFA-protected seller management workspace, activated in `AdminShell` and linked from Admin A's Suspended sellers card and Admin B's listing rows/inspection view. All URLs and RPC contracts use the seller's immutable `public_id` (never `auth.users.id`) and never expose passwords, authentication secrets, or private WhatsApp numbers.

Summary counts explicitly represent created rows in `public.seller_profiles` (total, personal, business, active, suspended, hidden), not total registered authentication accounts. Search is bounded (<= 120 chars), literal, case-insensitive across display name, username (`@username` supported), and exact `public_id`. Filters (`account`, `status`, `governorate`, `visibility`), sorting (`newest`, `updated`, `activity` = active+pending descending, then total listings, then updated_at, then `public_id`), and 24-row pagination execute server-side. Admin B's `/[locale]/admin/listings` now also accepts an exact validated `?seller=<public_id>` filter with a filtered-seller banner.

### Migration `029` contracts & capability separation
- **Defense-in-depth capability boundary**: `padelhub_review_writer` retains `moderation_profile_update` restricted to `account_status in ('suspended', 'hidden')` and still cannot write `account_status = 'active'` (`42501`). A separate hosted-safe capability role `padelhub_seller_admin` (`NOLOGIN NOINHERIT NOBYPASSRLS`, zero `auth` schema `USAGE`, zero `account_status`/`seller_contacts` privileges) owns account-type and listing-allowance updates (`UPDATE(account_type, listing_limit_override, version, updated_at)` only). Neither capability can ever reactivate a suspended or hidden seller.
- `admin_seller_inventory(query, account_type, account_status, governorate, visibility, sort, page)` (owned by `padelhub_review_writer`): privacy-safe paginated summaries, global counts, and live `platform_settings` defaults.
- `admin_seller_detail(seller_public_id)` (owned by `padelhub_review_writer`): profile/eligibility/consent indicators, dynamic defaults/override/effective allowance/usage/remaining capacity, full 9-status listing counts + live `public_visible` count, open report count, 30-day UTC approximate views & WhatsApp clicks (explicitly caveated as approximate clicks only, never verified sales/revenue), and up to 12 recent admin/moderator profile and listing audit entries.
- `admin_update_seller_account_type(seller_public_id, expected_version, account_type, reason)` (owned by `padelhub_seller_admin`): `READ COMMITTED`, `platform_settings FOR SHARE` → `seller_profiles FOR UPDATE`, expected version check, mandatory 1–1,000-char reason, transactional active+pending capacity validation against resulting effective allowance, atomic `profile.account_type_updated` audit record. Business classification never implies verification or legal registration; owners may still select their own account type under existing policy unless changed by owner approval.
- `admin_update_seller_listing_limit(seller_public_id, expected_version, limit_override, reason)` (owned by `padelhub_seller_admin`): `READ COMMITTED`, `platform_settings FOR SHARE` → `seller_profiles FOR UPDATE`, accepts `0..500` (including valid `0` when active+pending usage is `0`) or `NULL` (reset to live `platform_settings` default), rejects reductions below current active+pending usage (`PT409`) without auto-unpublishing listings, atomic `profile.listing_limit_updated` or `profile.listing_limit_reset` audit record.
- `admin_moderate_seller_status(seller_public_id, expected_version, account_status, reason)` (owned by `padelhub_review_writer`): `READ COMMITTED`, `seller_profiles FOR UPDATE`, supports `active -> hidden`, `active -> suspended`, and `hidden -> suspended` (explicitly rejecting `'active'` reactivation and `suspended -> hidden` softening), requires explicit UI confirmation + mandatory 1–1,000-char reason, writes `profile.hidden` or `profile.suspended` audit record. Immediately revokes marketplace listings, `/@username` profiles, `/api/profiles/[id]` QR redirects, `/api/contact/[id]` WhatsApp redirects, and `/api/media/[mediaId]?listing=...` public media delivery (including conditional `If-None-Match` requests), while preserving all saved listings, listing statuses, contact consent, and historical photos intact.
- `admin_listing_inventory(..., p_seller_public_id uuid default null)` & `admin_listing_inspection(p_listing_id)`: backwards-compatible extensions exposing exact seller filtering and `seller_public_id` navigation.

All 5 new audit actions (`profile.account_type_updated`, `profile.listing_limit_updated`, `profile.listing_limit_reset`, `profile.hidden`, `profile.suspended`) are registered with distinct EN/AR labels in Admin A's Recent Activity feed.

### Safe operator procedure — Manual seller restoration (deferred from UI)
Self-service or admin-UI seller restoration and appeal workflows are **intentionally deferred** and must not be added without explicit owner approval (see outstanding owner decision below). When an authorized incident review approves restoring a previously `hidden` or `suspended` seller account:

1. **Pre-restoration review**:
   - Inspect the seller's profile (`public_id`, `version`, `account_status`, `is_public`, `public_contact_consent`) and open reports (`private.abuse_reports`), plus recent `private.audit_logs` entries for `target_type = 'profile'` and `target_id = '<public_id>'`.
   - **Important**: Because hiding/suspending preserves `listings.status` (including previously approved `active` listings), setting `account_status = 'active'` will make any still-`active`, approved listings publicly visible again if `is_public = true` and `public_contact_consent = true`. Before restoring, confirm every `active` listing on the account is safe to republish (or transition offending listings to `removed` with a separate audit record first).
2. **Atomic operator SQL transaction** (executed as database operator, never through app capability roles):
   ```sql
   BEGIN;
   -- Lock profile and verify expected version & current non-active status
   SELECT user_id, public_id, account_status, version
   FROM public.seller_profiles
   WHERE public_id = '<seller-public-id>'
   FOR UPDATE;

   -- Only after verifying version = <expected-version> and offending listings are removed:
   UPDATE public.seller_profiles
   SET account_status = 'active',
       version = version + 1,
       updated_at = now()
   WHERE public_id = '<seller-public-id>'
     AND version = <expected-version>
     AND account_status IN ('hidden', 'suspended');

   INSERT INTO private.audit_logs (
     actor_user_id, actor_role, action, target_type, target_id, before_state, after_state, reason
   ) VALUES (
     '<operator-or-approver-user-id>',
     'admin',
     'profile.restored',
     'profile',
     '<seller-public-id>',
     jsonb_build_object('account_status', '<previous-status>', 'version', <expected-version>),
     jsonb_build_object('account_status', 'active', 'version', <expected-version> + 1),
     '<documented approval reference and reason>'
   );
   COMMIT;
   ```
3. **Post-restoration verification**: Confirm `/[locale]/admin/sellers/<public_id>` shows `active`, verify expected public storefront and listing visibility, and log the action in the operator incident record.

### Rollout & outstanding owner decisions
- Apply migration `029` strictly after `028` before serving this app version (`027` → `028` → `029` remain pending owner-authorized rollout on hosted `padelhub-staging`).
- **Owner decision required**: Whether to introduce an explicit admin-UI restoration/reactivation workflow (and whether restoration should automatically withdraw previously `active` listings to `draft` for fresh review, or preserve them) and whether owners should retain self-service Personal/Business switching after pilot launch.
- Feature development is frozen after Admin C; Admin D–F wait until after production readiness and the controlled pilot.
