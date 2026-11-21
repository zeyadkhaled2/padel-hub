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
- `admin_pending_listings(page)`: 24 pending summaries, oldest first, total count.
- `admin_get_listing_review(id)`: exact listing/profile versions and media manifest for decisions.
- `admin_approve_listing` / `admin_reject_listing`: existing transactional decisions; never replace the reviewed snapshot with a freshly fetched one when submitting.
- `admin_photo_delivery(listing, asset)`: MFA-authorized pending attachment only; storage keys stay in the server response pipeline.
- `get_my_listing_decision(id)`: owner-only rejection reason.

## Prompt for the UI agent
Refine the existing functional admin UI in `src/features/admin`, not a new dashboard framework. Read PROGRESS.md, DESIGN_SPEC.md and the calm-nextjs-design skill. Preserve bilingual EN/AR, RTL, light/dark themes, mobile layouts, noindex/no-store behavior and the existing Server Actions/RPCs. Prioritize a clear pending queue, readable listing/profile eligibility details, inspectable photos, and distinct approve/reject actions with required rejection reasons. Preserve MFA, revocation checks, stale-review handling and typed reasons on errors. Never expose storage keys, phone numbers or authenticator secrets in logs/screenshots; never grant roles through the UI. No analytics charts or speculative services. Run `npm run check` and local browser tests, record a short result in PROGRESS.md, and provide a small before/after explanation of components changed. Do not publish without authorization.

## Verification boundaries
Admin browser tests use synthetic verified account fixtures and real TOTP enrollment/challenge/verification. Email confirmation is covered separately by account tests. Test reviewer roles are revoked and active/pending fixture listings withdrawn afterward; saved images are retained. Screenshots cover verified review pages only. No hosted MFA, account recovery or production deployment is claimed.

## Content reports
`/admin/reports` uses the same active-role and MFA checks. Verified users may report public content (five per rolling 24 hours, one open report per target). Admins dismiss, remove a listing, or suspend a profile with a required note. Both report and target versions must match; reload conflicts instead of resubmitting with new versions automatically. Notes allow 1,000 characters. Saved photos remain intact. Restoration and appeal UI are not implemented yet.
