# PadelHub progress

Updated: 2026-11-18. Verified locally; hosted backend is not configured. Main-branch pushes are authorized and may trigger Vercel frontend deployment.

## Completed locally
- QR show/hide and PNG download, generated on demand in-browser. Permanent public-ID links resolve only public active profiles, then use visitor language. No external QR service or stored image.
- Categories: rackets, balls, padel shoes and bags. Shoes require EU size (20–55, half sizes) before submission; shoes/bags are sale-only with 1–6 photos. Category filters, owner/editor, admin review and public details updated.
- Public `/@username` profiles show opt-in profile details and approved active listings, with pagination and locale-neutral Copy profile link. Visitor language selection uses the existing locale cookie/browser preference. Usernames fixed after creation; migration 012 revokes rename API access while preserving public IDs and dormant alias data.
- Verified email accounts, private-by-default profiles and contact preferences. Everyone can buy and sell.
- Owner listing editor, protected photo upload/replacement, submission and withdrawal with stale-edit protection.
- Approved marketplace search/filters/sort/pagination, listing details and server-checked WhatsApp contact. Demo inventory is separate under `/demo`; EN/AR and light/dark supported.
- Admin authenticator enrollment/verification, 24-item pending queue, authorized full-size photo review, approve/reject and owner-visible rejection reasons. Decisions retain exact reviewed versions/media; snapshots are encrypted in action closures.
- Sold/traded, archive (published or pending listings), and relist-for-approval controls added. Migration 011 applied locally; ownership, expected versions and atomic submission checks enforced. Photos retained.
- Migration 010 applied locally. TOTP enabled in running Auth; previous Auth container retained stopped. User-selected verified account received local admin access; its authenticator setup is user-controlled.

## Verification
- Latest `npm run check`: lint, TypeScript and production build passed.
- Full browser suite: 16/16 passed, including downloaded QR PNG decoded independently, no-store ID redirect, visitor Arabic preference, shoe half-size persistence, bags, existing auth/admin/listing flows.
- Database: 504 assertions plus existing concurrency/isolation checks passed. Migrations 013–014 applied locally; no hosted migrations.
- 24 QR/profile and shoe-form locale/theme/width checks passed; mobile screenshots inspected. `git diff --check` passed.
- Earlier Vercel missing-module failure fixed by anchoring `/supabase/` in `.vercelignore`. Hosted backend remains unconfigured.

## Next
1. User completes authenticator setup at `/en/admin`. Minimal review UI works; refinement prompt is in [ADMIN_REVIEW.md](ADMIN_REVIEW.md).
2. Optional racket specifications, reports and basic analytics.
3. Hosted auth/email, recovery including MFA recovery, backups/restore and deployment checks before launch.

## Latest scope decision
- Usernames fixed for MVP. Share `/@username` without language; permanent public profile IDs remain internal identities and QR targets. Username changes/alias policy deferred.
- 2026-11-18: reservation and available-again controls deferred until after MVP; sold/traded/archive/relist now implemented locally. Existing reservation schema support retained, with no reservation controls exposed.

## Constraints and preview
- No checkout, automatic expiry or automatic deletion of saved photos. Keep implementation and notes small.
- Preview: http://127.0.0.1:3100/en ; admin: `/en/admin`; owner listings: `/en/account/listings`; demo: `/en/demo`.
- Hosted admin provisioning and production readiness remain unfinished. Docker service ports are not restricted to loopback; keep inventory synthetic until that is addressed.
- Run instructions: [LOCAL_ACCOUNTS.md](LOCAL_ACCOUNTS.md), [PHOTOS.md](PHOTOS.md). Remaining milestones: [FEATURE_ROADMAP.md](FEATURE_ROADMAP.md).
