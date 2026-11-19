# Feature milestones

Updated 2026-11-18. Earlier day estimates were not measured and are withdrawn. Track completed features and test results instead.

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

## Remaining, in order
1. **Admin UI refinement:** minimal MFA/queue/photo/decision UI works. UI-agent prompt and contracts are in ADMIN_REVIEW.md; no specialist orchestration is running.
2. **Marketplace controls:** configurable limits UI and basic views/contact counts. Clicks are not successful sales.
3. **Production readiness:** recovery, Google login, external email, deletion flows, abuse protections, backups/restore, monitoring and final accessibility/privacy/security checks.
4. **Hosted pilot:** user-approved hosting/costs, secrets/domain/config, migrations, smoke tests and rollback readiness.

No new specialist orchestration or handoff reports. Keep one dependent feature in progress. No checkout, payments, automatic expiry or automatic deletion of saved photos. Seller-reported deal counts still require a product decision.

Current next functional milestone: basic analytics; review frontend v2 integration before merging. Detailed progress/checks: PROGRESS.md. Local account/photo run instructions: LOCAL_ACCOUNTS.md and PHOTOS.md.

## After MVP
- Reservation and available-again controls (deferred by Ziad on 2026-11-18).
