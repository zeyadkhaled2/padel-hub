# Raketna — Authentication, Custom SMTP, Google OAuth & Admin MFA Recovery Runbook

Last updated: 2026-11-26
Target staging project: `padelhub-staging` (`ref: sxghreukdkxclymysryp`, `eu-central-1`, Free plan)
Scope: **MVP Launch Readiness authentication configuration** (custom SMTP required for real sellers; Google OAuth optional and automatically hidden when disabled).

---

## 1. Custom Transactional Email (Resend SMTP)

Supabase's built-in email service is limited to **2 emails/hour** and delivers only to organization team members. Real sellers require custom SMTP.

### 1.1 Provider Choice, Costs & Limits
- **Preferred provider**: **Resend** (Free plan: **\$0/month**, commercial use permitted, up to **3,000 emails/month** and **100 emails/day**; Pro \$20/month only if pilot volume exceeds limits).
- **Supabase Auth rate limits after enabling Custom SMTP**: Supabase imposes an initial safety rate limit of **30 emails/hour** (`Authentication → Rate Limits`) and a **60-second** per-user cooldown on signup confirmation and password-recovery emails.

### 1.2 Sender Identity & Required DNS Records
Use a dedicated transactional subdomain (never mix auth emails with future marketing mail):
- Recommended sender address: `no-reply@auth.<your-domain>` (or `no-reply@<your-domain>`)
- Sender display name: `Raketna`

Configure these DNS records at your domain registrar after adding the domain in Resend:

| Record | Host / Name | Purpose |
| --- | --- | --- |
| **SPF (`TXT`)** | `send.auth.<your-domain>` (per Resend UI) | Authorizes Resend's mail servers to send on behalf of the sending domain (`v=spf1 include:amazonses.com ~all` / Resend-provided value). |
| **DKIM (`TXT` or `CNAME`)** | `resend._domainkey.auth.<your-domain>` (exact name from Resend) | Cryptographically signs outgoing emails to prove authenticity and prevent spoofing. |
| **MX (`MX`)** | `send.auth.<your-domain>` (per Resend UI) | Handles bounce/feedback notifications for sending reputation. |
| **DMARC (`TXT`)** | `_dmarc.<your-domain>` | Enforces alignment & reporting (start with `v=DMARC1; p=quarantine; rua=mailto:dmarc@<your-domain>; adkim=s; aspf=s;`, then tighten to `p=reject` after verifying delivery). |

### 1.3 Critical Resend Setting — Disable Link & Open Tracking
In Resend Domain Settings, **turn OFF Click Tracking and Open Tracking** for the authentication sending domain. Link-tracking wrappers rewrite and prefetch single-use Supabase authentication links, causing `token_hash` verification to fail with expired/invalid errors.

### 1.4 Configuring Supabase Custom SMTP (Dashboard — Owner Action)
Never store SMTP credentials in Git, `.env.example`, or Next.js application runtime variables:
1. In Resend, create a sending-only API key restricted to the verified sending domain.
2. In Supabase Dashboard (`<target-project>` → `Authentication → Emails → SMTP Settings`):
   - Enable **Custom SMTP**.
   - **Sender email**: `no-reply@auth.<your-domain>`
   - **Sender name**: `Raketna`
   - **Host**: `smtp.resend.com`
   - **Port**: `465` (SSL/TLS) or `587` (STARTTLS)
   - **Username**: `resend`
   - **Password**: `<Resend sending-only API key>`
3. Keep **Confirm email** ON (`mailer_autoconfirm = false`) and **Anonymous sign-ins** OFF.

### 1.5 Auth Email Templates
Repository templates live in `supabase/templates/` and use bilingual English + Arabic Raketna copy with zero external images, zero marketing copy, zero link tracking, and zero echoed user input:
- **Confirm signup** ([confirmation.html](../supabase/templates/confirmation.html)):
  - Suggested subject: `Confirm your Raketna email / تأكيد بريدك الإلكتروني على راكتنا`
  - Link format: `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=signup`
- **Reset password** ([recovery.html](../supabase/templates/recovery.html)):
  - Suggested subject: `Reset your Raketna password / إعادة تعيين كلمة مرور راكتنا`
  - Link format: `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery`
- **Password changed notification** ([password_changed.html](../supabase/templates/password_changed.html)) (optional security notification in `Authentication → Notifications`).

Using `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=...` preserves the user's locale (`/en/` vs `/ar/`) AND works reliably even when an email link is opened in a different browser or mobile mail app.

### 1.6 Real External Email Verification Checklist
Before marking external email delivery complete on staging, test with authorized real inboxes:
1. Signup sends a real confirmation email from `no-reply@auth.<your-domain>` with valid SPF/DKIM/DMARC headers.
2. Unverified account cannot sign in or open `/en/account` or `/ar/account`.
3. Clicking the confirmation link verifies the account and redirects cleanly to `/<locale>/account` with zero tokens remaining in the URL.
4. Reusing or tampering with a confirmation link redirects safely to `/<locale>/auth/signin?error=confirmation`.
5. Forgot-password sends a real recovery email; clicking it opens `/<locale>/auth/reset-password`, updates the password, signs out old sessions, rejects the old password, and accepts the new password.
6. Both `/en/` and `/ar/` callback/recovery links work.
7. Confirm SMTP credentials, API keys, and tokens never appear in email links, server logs, or rendered HTML.

---

## 2. Password Recovery Architecture & Redirect URL Allowlist

### 2.1 Required Exact Redirect URLs (No Wildcards)
In Supabase Dashboard (`padelhub-staging` → `Authentication → URL Configuration → Redirect URLs`), allowlist ONLY these exact four paths for `<PADELHUB_APP_ORIGIN>`:
- `<PADELHUB_APP_ORIGIN>/en/auth/callback`
- `<PADELHUB_APP_ORIGIN>/ar/auth/callback`
- `<PADELHUB_APP_ORIGIN>/en/auth/recovery`
- `<PADELHUB_APP_ORIGIN>/ar/auth/recovery`

(Local development `supabase/config.toml` already includes all four for `http://127.0.0.1:3100`.)

### 2.2 Security Boundaries Implemented
- **Routes**: `/[locale]/auth/forgot-password`, `/[locale]/auth/recovery` (Route Handler), `/[locale]/auth/reset-password`. All responses are `force-dynamic`, `robots: noindex, nofollow`, `Cache-Control: private, no-store`, and `Referrer-Policy: no-referrer`.
- **Anti-enumeration**: `requestPasswordReset` returns the same generic notice whether or not an email is registered (distinguishing only `429` rate limits and unavailable service).
- **Fixed destinations**: `/[locale]/auth/recovery` and `/[locale]/auth/callback` ignore `next`, `redirect_to`, and request `Host`; destinations are always constructed from server-configured `PADELHUB_APP_ORIGIN`.
- **Mid-recovery session isolation (server-side, zero cookie dependency)**:
  - Isolation is enforced at **both** the Next.js server boundary (`verifiedUserClient()`, used by all account pages, admin pages, and protected photo upload/delivery handlers) **and** the PostgreSQL RPC boundary (`private.verified_auth_caller()` → `private.is_active_account_session()` in migrations `020`–`022`, which fail closed whenever `session_id` or `amr` is absent).
  - Recovery sessions carry signed JWT `amr` claims with `otp` (or `recovery`) and **no** primary interactive login method (`password`/`oauth`), even after MFA elevation (`amr = [otp, totp]`, `aal = aal2`) and across token refreshes.
  - Because initial email signup confirmation also emits `amr = [otp]`, PostgreSQL enforces **default-deny** on OTP/recovery sessions and allowlists at most one genuine first-time signup confirmation session per `user_id` in `private.confirmed_signup_sessions` (`service_role`-only `approve_signup_confirmation_session`, rejecting any account with `recovery_sent_at` set).
  - `/[locale]/auth/callback` strictly rejects `type=email` (preventing recovery `token_hash` cross-type replay) and revokes any unapproved OTP/recovery PKCE code immediately.
  - An invalid/expired/reused subsequent `/[locale]/auth/recovery` request revokes any existing unfinished recovery session (`signOut({ scope: 'local' })`) instead of leaving it active.
- **MFA-protected accounts**: Supabase Auth enforces `insufficient_aal` (`401`) on `updateUser({ password })` when a user has a verified TOTP factor. `/[locale]/auth/reset-password` requires a 6-digit TOTP verification before unlocking the new-password form. Even after completing recovery TOTP (`aal2`), the recovery session remains blocked from `/admin`, `/api/admin/*`, and all direct admin/owner RPCs until password reset finishes and the user signs in normally. Password reset NEVER removes or bypasses MFA.
- **Global session revocation**: Successful password update calls `signOut({ scope: 'global' })` and redirects to `/[locale]/auth/signin?reset=1`.

---

## 3. Continue with Google (Optional for Pilot — Google Cloud + Supabase OAuth)

Google OAuth is **optional for the controlled pilot** and does not block launch. Whenever Google is disabled in Supabase Auth (`external.google !== true`), `AuthPage` checks `/auth/v1/settings` server-side and **automatically hides** the `Continue with Google` button on `/[locale]/auth/signin` and `/[locale]/auth/signup` so users never encounter a broken sign-in button. The `continueWithGoogle` Server Action also remains fail-closed if invoked directly. Enable Google later without code changes using the steps below.

### 3.1 Google Cloud Console Setup (Optional Owner Action)
1. Open [Google Auth Platform Console](https://console.cloud.google.com/auth/overview) in a dedicated staging/app Google Cloud project.
2. **Branding**: Set App name (`PadelHub Staging`), User support email, and Developer contact email.
3. **Audience**: Choose **External**. While in **Testing** publishing status on staging, add explicit authorized test Gmail addresses under **Test users** (no Google app verification is required in Testing mode; publish & complete brand verification before public launch).
4. **Data Access (Scopes)**: Configure **ONLY** minimal identity scopes:
   - `openid`
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - **Do NOT add** Gmail, Drive, Calendar, or any sensitive/restricted scopes.
5. **Clients → Create OAuth client ID → Web application**:
   - **Authorized JavaScript origins**: `<PADELHUB_APP_ORIGIN>` (e.g. `http://127.0.0.1:3100` for local staging verification, or `https://<staging-origin>` when hosted).
   - **Authorized redirect URIs**:
     - `https://sxghreukdkxclymysryp.supabase.co/auth/v1/callback`
6. Save the **Client ID** and **Client Secret** securely (never commit to Git or put in Next.js env vars).

### 3.2 Supabase Staging Provider Setup (Owner Action)
In Supabase Dashboard (`padelhub-staging` → `Authentication → Sign In / Providers → Google`):
1. Toggle **Enable Sign in with Google** ON.
2. Paste the Web **Client ID** and **Client Secret** from Google Cloud.
3. Keep **Skip nonce checks** OFF (only needed for native iOS clients).
4. Keep **Confirm email** ON and **Anonymous sign-ins** OFF.
5. Confirm `node scripts/staging-app.mjs auth-status` reports `"google_enabled": true` and `"mailer_autoconfirm": false`.

### 3.3 Application Integration & Account Identity Rules
- Initiation runs server-side in `continueWithGoogle` (`src/features/auth/actions.ts`): checks `auth/v1/settings` (`external.google === true`), calls `signInWithOAuth({ provider: 'google', options: { redirectTo: '<origin>/<locale>/auth/callback', scopes: 'openid email profile', queryParams: { prompt: 'select_account' } } })`, stores the PKCE verifier in an `httpOnly` `SameSite=Lax` cookie, validates that the returned URL origin matches `PADELHUB_SUPABASE_URL` and path `/auth/v1/authorize`, then redirects.
- Callback (`/[locale]/auth/callback`) maps `error=access_denied` to `?error=oauth_cancelled` and other OAuth errors to `?error=oauth` without reflecting untrusted `error_description` strings, exchanges PKCE `code` via `exchangeCodeForSession`, verifies `getUser()` + `email_confirmed_at`, and redirects to `/[locale]/account`.
- **New Google user**: Lands on `/[locale]/account` with NO auto-created or public seller profile; must explicitly create a private profile and opt in to visibility & WhatsApp consent.
- **Existing verified email/password user with same Gmail**: Supabase Auth's built-in **Automatic Linking** attaches the verified `google` identity to the existing `auth.users.id`, preserving seller profile, listings, photos, and moderation history without any manual email-string merging in app code. If an unconfirmed email/password signup existed for that email, Supabase drops the unconfirmed identity to prevent pre-account takeover.
- **Admin Google user**: Google sign-in grants zero admin privileges (`private.admin_roles` + `aal2` TOTP remain strictly mandatory).

---

## 4. Secure Admin MFA Recovery Procedures

**Hard invariants (enforced in code and PostgreSQL):**
- There is **no** web or API endpoint to disable admin MFA or grant admin roles.
- Password recovery **never** bypasses `/admin` MFA and **never** removes an enrolled TOTP factor.
- Google OAuth metadata and email domains **never** grant privileges.
- TOTP setup secrets are displayed only once during enrollment and cannot be read afterward.

### 4.1 Operator Verification & Two-Person Approval Policy
For any production or pilot admin MFA recovery (and as standard discipline on staging):
1. **Out-of-band identity verification**: Confirm the requesting admin's identity over a trusted secondary channel (live voice/video call or in-person verification — never by email alone).
2. **Two-person approval** (when two or more owners/operators exist): One authorized operator reviews and approves the incident ticket; the database/Supabase operator executes the recovery step.
3. **Audit record**: Log date/time (UTC), affected admin UUID, incident type, approver identity, operator identity, and actions taken in the operations incident log (never log TOTP secrets, passwords, or service keys).

### 4.2 Scenario Procedures

#### Scenario A — Lost Authenticator Device (Preferred Path: Replacement Account)
1. Have the administrator register and email-verify a brand-new account (or confirm their existing account password was not compromised).
2. **Preferred MVP path**: Grant the replacement account UUID in `private.admin_roles`, verify the replacement admin signs in, enrolls a fresh TOTP authenticator at `/en/admin`, and reaches `aal2`. Then immediately revoke the old account:
   ```sql
   UPDATE private.admin_roles SET revoked_at = now() WHERE user_id = '<old-admin-uuid>';
   ```
3. **Same-account recovery path** (only if account continuity is required and the account is NOT suspected of compromise):
   - Step 1: Temporarily revoke the admin role first (`UPDATE private.admin_roles SET revoked_at = now() WHERE user_id = '<admin-uuid>';`) so no privileged actions can happen during recovery.
   - Step 2: Using server-only service-role credentials in a private operator terminal (never in browser or web routes), list and delete the lost factor via Supabase Auth Admin MFA API:
     - `serviceClient.auth.admin.mfa.listFactors({ userId })`
     - `serviceClient.auth.admin.mfa.deleteFactor({ userId, id: factorId })` (Supabase automatically invalidates all active sessions when a verified factor is deleted).
   - Step 3: Re-grant `private.admin_roles` (`UPDATE private.admin_roles SET revoked_at = NULL WHERE user_id = '<admin-uuid>';` or insert replacement record if moving to a fresh UUID).
   - Step 4: Admin signs in fresh, immediately enrolls a brand-new TOTP factor on `/en/admin`, verifies a 6-digit code (`aal2`), and confirms access.

#### Scenario B — Compromised Authenticator Device
1. **Immediately** revoke the admin role (`UPDATE private.admin_roles SET revoked_at = now() WHERE user_id = '<admin-uuid>';`) — takes effect on the next RPC call even for existing `aal2` sessions.
2. Delete all MFA factors via `auth.admin.mfa.deleteFactor` (terminates all active sessions).
3. Force a password change (or ban the compromised user via Auth Admin API) and review `private.audit_logs` for any unauthorized moderation approvals, rejections, removals, or suspensions during the exposure window.
4. Provision a replacement admin account or re-enroll a clean authenticator only after confirming email and device security.

#### Scenario C — Locked-Out Administrator (Forgotten Password, Authenticator Still Intact)
1. Admin uses `/en/auth/forgot-password` (or `/ar/auth/forgot-password`) to receive a single-use recovery link.
2. Opening the recovery link lands on `/en/auth/reset-password`, which prompts for their **6-digit TOTP authenticator code** first (`aal2` required by Supabase Auth before password update).
3. After entering a valid TOTP code and choosing a new password, all existing sessions are signed out globally (`scope: 'global'`), the TOTP factor remains intact, and the admin signs in with their new password + fresh TOTP code.

#### Scenario D — Compromised Admin Account (Password, Email, or Google Takeover)
1. Immediately revoke `private.admin_roles` (`revoked_at = now()`).
2. In Supabase Dashboard (`Authentication → Users`) or Auth Admin API, ban the compromised user and delete active MFA factors / sessions.
3. Audit `private.audit_logs` and `private.listing_moderation_state` for any tampered moderation decisions.
4. Do NOT reuse a compromised email/Google identity for admin privileges; provision a new, verified replacement admin account with fresh TOTP enrollment.

---

## 5. Safe Rollback & Provider-Disable Procedures

- **Disable Google Login immediately**: Toggle **Google** OFF in `Authentication → Sign In / Providers` on Supabase Dashboard. PadelHub checks `/auth/v1/settings` server-side on every render of `/[locale]/auth/signin` and `/[locale]/auth/signup` and immediately hides the `Continue with Google` button without redeploying code (while `continueWithGoogle` stays fail-closed).
- **Disable/rotate Custom SMTP**: Rotate the Resend API key or swap SMTP credentials in `Authentication → Emails → SMTP Settings`. **Never** turn off `Confirm email` (`mailer_autoconfirm`) as a workaround for SMTP issues — signup intentionally fails closed if confirmation is disabled.
- **Rollback application code**: Reverting the Git commit or promoting the previous deployment rolls back the Next.js UI/routes safely, while forward-only migrations `020`–`021` (`private.confirmed_signup_sessions` and `private.is_active_account_session`) remain strictly backwards-compatible with primary `password`/`oauth` sessions (never drop or edit applied migrations).

---

## 6. Phase 2B Security Review Summary

Audited across all Phase 2B changes:
- **User enumeration**: Forgot-password returns identical generic confirmation for unknown and registered emails.
- **Open redirects & Host header injection**: `/[locale]/auth/callback` and `/[locale]/auth/recovery` ignore `next`, `redirect_to`, and request `Host`, always redirecting to fixed paths on `PADELHUB_APP_ORIGIN`; `continueWithGoogle` validates `isTrustedOAuthRedirectUrl(data.url, config.url)` before redirecting.
- **OAuth XSS / error spoofing**: Callback maps only `access_denied` vs generic `oauth` to fixed allowlisted notice keys; raw `error_description` is never rendered.
- **PKCE & Cookie security**: `@supabase/ssr` `serverClient()` writes PKCE verifiers and sessions with `httpOnly: true`, `sameSite: 'lax'`, `secure` on HTTPS; recovery isolation does **not** depend on any auxiliary cookie or client TTL.
- **Session fixation, cross-type replay & recovery isolation**: Mid-recovery sessions (`aal1` and MFA-elevated `aal2`) are denied across `/account`, `/account/listings`, `/account/photos`, `/admin`, protected photo delivery/upload APIs (`/api/media/*`, `/api/listings/*/photos`, `/api/admin/listings/*/photos/*`), and direct Supabase RPCs (`42501`), surviving cookie removal/expiry and session refresh. Invalid subsequent `/[locale]/auth/recovery` requests revoke any active unfinished recovery session; `/[locale]/auth/callback` rejects `type=email` cross-type token replay; successful password reset calls `signOut({ scope: 'global' })`.
- **Token leakage**: `code` and `token_hash` are exchanged server-side in Route Handlers and stripped via redirect with `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer`; zero tokens logged or printed.
- **Admin MFA & privilege escalation**: Verified empirically on `padelhub-staging` that password recovery on an MFA-enrolled admin enforces TOTP (`aal2`), never removes the factor, blocks `/admin` bypass, and immediate role revocation denies active `aal2` sessions.
- **No directly exploitable security issues remain in the implemented authentication code.** Remaining external-service verification items (live Resend SMTP inbox delivery & real Google Cloud OAuth consent flow) are explicitly tracked as blocked pending owner provider/DNS credentials.
