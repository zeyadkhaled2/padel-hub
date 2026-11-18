# Local accounts and profiles

This is a local integration, separate from demo inventory. It supports email signup and confirmation, password sign-in, sign-out, server-verified sessions, private profile creation, profile edits, username changes and explicit WhatsApp consent. Google OAuth, password recovery, public storefront pages and the full listing UI are unfinished. Equipment photo upload/preview now works; see PHOTOS.md and use scripts/local-app.mjs to enable its server-only Storage access. Do not use this setup for production accounts.

## Run

Keep local Supabase running. From the repository root in PowerShell, capture local configuration without printing keys or editing `.env.local`:

```powershell
$localStatus = npx supabase status -o json | ConvertFrom-Json
$env:PADELHUB_SUPABASE_URL = $localStatus.API_URL
$env:PADELHUB_SUPABASE_PUBLISHABLE_KEY = $localStatus.PUBLISHABLE_KEY
if (-not $env:PADELHUB_SUPABASE_PUBLISHABLE_KEY) { $env:PADELHUB_SUPABASE_PUBLISHABLE_KEY = $localStatus.ANON_KEY }
$env:PADELHUB_APP_ORIGIN = 'http://127.0.0.1:3100'
npm run dev -- --hostname 127.0.0.1 --port 3100
```

Use http://127.0.0.1:3100/en/auth/signup (or `/ar/auth/signup`). Open the confirmation email in the local inbox at http://localhost:54324 and follow it in the same browser used for signup. PKCE confirmation depends on that browser's cookie. Use synthetic email addresses; no external email delivery is configured. Profiles start private with contact off. Public/contact settings currently save preferences only; public seller pages still use clearly labeled demos.

The dedicated PADELHUB variables deliberately do not fall back to existing hosted environment settings. Use only the local public/anon key, never a service-role key. Missing configuration disables the account form. The production build can run with the same runtime variables using `npm run start -- --hostname 127.0.0.1 --port 3100` after `npm run check`.

## Verify

In a second terminal against the configured local app:

```powershell
$env:PADELHUB_AUTH_E2E = '1'
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm run test:e2e -- --workers=1
```

The account cases require local Auth with email confirmation enabled and Mailpit. They create synthetic local accounts and profiles, which remain available in Studio; they do not reset or delete existing data. Authentication traces/screenshots/videos are disabled to avoid capturing credentials. Existing marketplace tests also run. For automatic test server startup, provide the same three PADELHUB configuration variables in that terminal.

See `supabase/README.md` for migration prerequisites, including migration 006's schema-owner grant requirement and the unresolved local Docker published-port limitation. Studio remains at http://localhost:54323.

