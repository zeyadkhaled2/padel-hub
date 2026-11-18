# PadelHub progress

Updated: 2026-11-18. Features verified locally; hosted backend is not configured. Main-branch push authorized by the user; connected Vercel may deploy the frontend automatically.

## Completed locally
- EN/AR marketplace with light/dark themes. Illustrative inventory is separate under `/demo`.
- Verified email accounts, private-by-default profiles and contact preferences. Everyone can buy and sell.
- Owner listing index, racket/ball draft editor, photo upload/replacement, submission and withdrawal. Version checks prevent stale overwrites.
- Approved inventory browse/search/filters/sort with 24-item pages; listing details, protected photos and seller summaries. WhatsApp destinations are generated server-side with fresh eligibility checks.
- Database approval/rejection functions require an authorized admin and MFA. Migrations 001–009 applied locally; dashboard UI is not built.
- Fixed listing photos hiding card text. Updated EN/AR marketplace, FAQ and account copy to reflect implemented features and distinguish demo inventory.

## Verification
- Latest `npm run check`: lint, TypeScript and production build passed.
- Latest browser suite: 14/14 passed, including anonymous buyer/contact flow and denial after withdrawal.
- Latest visual checks: 32 browse/detail combinations across EN/AR, light/dark and 320/390/768/1440px; no overflow/page errors. Card image/content boundaries checked; desktop light and mobile Arabic dark screenshots inspected.
- Prior database run: 435 assertions plus concurrency/isolation checks passed. No SQL changed this session.
- `git diff --check` passed. Synthetic approved visual fixture was withdrawn afterward; no WhatsApp message sent.

## Repository checkpoint
- Checkpoint includes the tested database/account/photo/listing/buyer work. Secrets, caches and local handoffs remain excluded. No application changes since the checks above.

## Next
1. Admin review workflow: pending queue, real admin MFA sign-in, authorized review photos, approval/rejection UI and owner-visible reasons. Prepare the UI prompt for the user's chosen agent once those contracts are ready.
2. Listing lifecycle controls, optional racket specifications, public profiles/aliases/QR, reporting and basic analytics remain.
3. Hosted auth/email, recovery, backups/restore and deployment checks before launch.

## Constraints and preview
- Direct work only; keep implementation and progress notes small. No checkout, automatic expiry or automatic deletion of saved photos.
- Preview: http://127.0.0.1:3100/en ; owner listings: `/en/account/listings`; design demo: `/en/demo`. Real browse may be empty until listings are approved.
- Public seller profile pages, admin dashboard, hosted setup and production readiness remain unfinished. Local Docker ports are not restricted to loopback; synthetic data only.
- Run instructions: [LOCAL_ACCOUNTS.md](LOCAL_ACCOUNTS.md), [PHOTOS.md](PHOTOS.md). Remaining milestones: [FEATURE_ROADMAP.md](FEATURE_ROADMAP.md).
