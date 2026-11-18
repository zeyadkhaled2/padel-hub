# PadelHub progress

Updated: 2026-11-18. Verified locally; hosted backend is not configured. Main-branch pushes are authorized and may trigger Vercel frontend deployment.

## Completed locally
- Verified email accounts, private-by-default profiles and contact preferences. Everyone can buy and sell.
- Owner listing editor, protected photo upload/replacement, submission and withdrawal with stale-edit protection.
- Approved marketplace search/filters/sort/pagination, listing details and server-checked WhatsApp contact. Demo inventory is separate under `/demo`; EN/AR and light/dark supported.
- Admin authenticator enrollment/verification, 24-item pending queue, authorized full-size photo review, approve/reject and owner-visible rejection reasons. Decisions retain exact reviewed versions/media; snapshots are encrypted in action closures.
- Migration 010 applied locally. TOTP enabled in running Auth; previous Auth container retained stopped. User-selected verified account received local admin access; its authenticator setup is user-controlled.

## Verification
- Vercel failure diagnosed: unanchored `supabase` in `.vercelignore` removed `src/server/supabase`, causing missing-module build errors. Changed to `/supabase/`; local `npm run check` and 10/10 foundation browser tests passed. Hosted rebuild verification pending.
- `npm run check`: lint, TypeScript and production build passed on the final code.
- Full browser suite: 16/16 passed; after the final encrypted-snapshot change, both affected admin tests passed again (2/2).
- Admin checks cover real TOTP, invalid codes, fresh challenge after sign-in, private photos, rejection reasons, stale decisions, approval and revocation. 32 queue/review locale/theme/width combinations passed; screenshots inspected.
- Database: 456 assertions plus concurrency/isolation checks passed. `git diff --check` passed.
- Synthetic test roles revoked; active/pending fixture listings withdrawn; saved images retained. Tests did not enroll or read the real user's authenticator.

## Next
1. User completes authenticator setup at `/en/admin`. Minimal review UI works; refinement prompt is in [ADMIN_REVIEW.md](ADMIN_REVIEW.md).
2. Listing lifecycle controls (reserved/sold/traded/archive/relist), optional racket specifications, public profiles/aliases/QR, reports and basic analytics.
3. Hosted auth/email, recovery including MFA recovery, backups/restore and deployment checks before launch.

## Constraints and preview
- No checkout, automatic expiry or automatic deletion of saved photos. Keep implementation and notes small.
- Preview: http://127.0.0.1:3100/en ; admin: `/en/admin`; owner listings: `/en/account/listings`; demo: `/en/demo`.
- Hosted admin provisioning and production readiness remain unfinished. Docker service ports are not restricted to loopback; keep inventory synthetic until that is addressed.
- Run instructions: [LOCAL_ACCOUNTS.md](LOCAL_ACCOUNTS.md), [PHOTOS.md](PHOTOS.md). Remaining milestones: [FEATURE_ROADMAP.md](FEATURE_ROADMAP.md).
