# PadelHub progress

Updated: 2026-11-19. Verified locally; hosted backend is not configured. Main-branch pushes are authorized and may trigger Vercel frontend deployment.

## Completed locally
- Basic analytics: owner totals and MFA-admin marketplace totals for the last 30 UTC calendar days; approximate listing views and WhatsApp clicks. Private daily counters, no visitor identifiers. Migration 016 applied locally.
- Reports/moderation: verified-account reports, duplicate protection and 5/day limit; MFA-admin queue, dismissal, listing removal and profile suspension with target/report version checks and audit records. Details and decision notes remain limited to 1,000 characters. Migration 015 applied locally.
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
- Database: 536 assertions plus existing concurrency/isolation checks passed. Migrations 013–014 applied locally; no hosted migrations.
- Earlier 24 QR/profile and shoe-form locale/theme/width checks passed; mobile screenshots inspected. `git diff --check` passed.
- Earlier Vercel missing-module failure fixed by anchoring `/supabase/` in `.vercelignore`. Hosted backend remains unconfigured.

## Next
1. User completes authenticator setup at `/en/admin`. Minimal review UI works; refinement prompt is in [ADMIN_REVIEW.md](ADMIN_REVIEW.md).
2. Shoe-size filtering, then optional racket weight/shape/year.
3. Hosted auth/email, recovery including MFA recovery, backups/restore and deployment checks before launch.

## Latest scope decision
- 2026-11-19: Ziad is still working on frontend `v2`. Review and merge are deferred until he explicitly says it is ready; continue functional work independently.
- Approved research priorities: shoe-size filtering, optional racket specifications, and a permissioned pilot with 5–10 sellers. Simple swap cash-difference preferences are a later improvement; escrow, financing, checkout bundles and comparison tools are deferred. Scrape/competitor claims have not been independently verified.
- Usernames fixed for MVP. Share `/@username` without language; permanent public profile IDs remain internal identities and QR targets. Username changes/alias policy deferred.
- 2026-11-18: reservation and available-again controls deferred until after MVP; sold/traded/archive/relist now implemented locally. Existing reservation schema support retained, with no reservation controls exposed.

## Latest reports verification
- Reports commit `87e5844` is on main. On 2026-11-19, clean isolated install and `npm run check` passed; both final admin browser tests passed (2/2), including 12 EN/AR theme/width report-queue checks. Arabic dark mobile screenshot inspected. Earlier full browser suite: 16/16; database: 521 assertions plus races. No new application changes were needed.
- Frontend branch `v2` is based on the old demo-only baseline; review/integrate it against current main before merging. Original `E:/projects/padelHub` remains on v2.

## Constraints and preview
- No checkout, automatic expiry or automatic deletion of saved photos. Keep implementation and notes small.
- Preview: http://127.0.0.1:3100/en ; admin: `/en/admin`; owner listings: `/en/account/listings`; demo: `/en/demo`.
- Hosted admin provisioning and production readiness remain unfinished. Docker service ports are not restricted to loopback; keep inventory synthetic until that is addressed.
- Run instructions: [LOCAL_ACCOUNTS.md](LOCAL_ACCOUNTS.md), [PHOTOS.md](PHOTOS.md). Remaining milestones: [FEATURE_ROADMAP.md](FEATURE_ROADMAP.md).

## Latest analytics verification — 2026-11-19
- `npm run check` passed; lint/typecheck also passed after final test edits. Database: 536 assertions plus existing races passed. Admin browser tests passed separately on desktop/mobile (2/2), including 8 owner-analytics locale/theme/width checks and existing admin/report layouts; Arabic dark mobile screenshot inspected.
- Tested view recording/reload deduplication, cross-origin rejection, owner isolation, admin MFA, 30-day boundary, hidden-content exclusion and WhatsApp redirect during disabled analytics writes. Browser testing caught and fixed the metrics RPC volatility setting required by admin role locking.
- Counts begin at activation; no backfill. Tab/day deduplication is best-effort; blocked storage/JS or network failures undercount, repeated clicks/bots/self-visits can inflate counts. Not unique people or verified sales. No hosted migration/deployment verification this session. Frontend v2 review/merge remains on hold.
- Next: shoe-size filter, then optional racket specifications. No new agents or dependencies.
