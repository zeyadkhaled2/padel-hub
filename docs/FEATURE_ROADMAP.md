# Feature milestones

Updated 2026-11-20. Earlier day estimates were not measured and are withdrawn. Track completed features and test results instead.

## Done locally
- EN/AR, light/dark marketplace demo.
- Database permissions, profile operations, listing draft/submit/withdraw and admin approve/reject functions.
- Email-confirmed accounts, protected profile editing and session management. Everyone can buy and sell; Personal/Business are account types.
- Equipment-photo upload, resizing/metadata removal, saved previews, replacement and protected delivery. Synchronous requests; no background-worker system.

- Owner listing index and category-specific draft editor, saved-photo links, submit/withdraw feedback and stale-edit protection.

- Approved marketplace browse/search/filter/sort/pagination, listing details and fresh WhatsApp contact checks. Demo inventory lives under `/demo`.

- MFA-protected admin queue/review, approval/rejection and owner-visible rejection reasons.

- Seller sold/traded, archive and relist-for-approval controls, retaining photos and rejecting stale updates. Reservation is deferred.

- Public `/@username` profile pages, active approved listings and copy-link sharing; fixed MVP usernames and visitor language selection.

- Profile QR display/download with permanent public-ID redirects and visitor language selection.
- Shoes (EU size including halves) and bags alongside rackets/balls; sale-only accessories, approval and category filters.

- Verified-account reports, MFA-admin report handling, listing removal and profile suspension; 1,000-character notes retained. Restoration/appeal UI remains future work.

- Basic analytics: approximate views over 30 UTC calendar days for owners; WhatsApp-click totals are available only to MFA admins. No visitor identities or verified-sales claims.

- Exact EU shoe-size search (20–55, half sizes), URL persistence, pagination and category shortcut reset.

## Remaining, in order
1. **Small marketplace improvements:** optional racket weight/shape/year. Configurable-limit screens are optional for launch.
2. **Production readiness:** recovery, Google login, external email, deletion flows, abuse protections, backups/restore, monitoring and final accessibility/privacy/security checks.
3. **Hosted pilot:** user-approved hosting/costs, secrets/domain/config, migrations, smoke tests and rollback readiness; recruit 5–10 willing sellers with permissioned inventory.

**Frontend on hold:** Ziad is working on `v2`. Review/integration and admin visual refinement wait until he explicitly says it is ready. This does not block independent functional work.

No new specialist orchestration or handoff reports. Keep one dependent feature in progress. No checkout, payments, automatic expiry or automatic deletion of saved photos. Seller-reported deal counts still require a product decision.

Current next functional milestone: optional racket specifications; frontend review/merge waits for Ziad. Detailed progress/checks: PROGRESS.md. Local account/photo run instructions: LOCAL_ACCOUNTS.md and PHOTOS.md.

## After MVP
- Reservation and available-again controls (deferred by Ziad on 2026-11-18).
- Simple swap cash-difference preferences: later improvement, no internal negotiation system yet.
- Escrow/authenticity operations, financing, checkout bundles and racket comparison: deferred.
