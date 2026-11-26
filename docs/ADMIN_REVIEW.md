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
