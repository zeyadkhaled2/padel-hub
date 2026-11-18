# Feature milestones

Updated 2026-11-18. Earlier day estimates were not measured and are withdrawn. Track completed features and test results instead.

## Done locally
- EN/AR, light/dark marketplace demo.
- Database permissions, profile operations, listing draft/submit/withdraw and admin approve/reject functions.
- Email-confirmed accounts, protected profile editing and session management. Everyone can buy and sell; Personal/Business are account types.
- Equipment-photo upload, resizing/metadata removal, saved previews, replacement and protected delivery. Synchronous requests; no background-worker system.

- Owner listing index and category-specific draft editor, saved-photo links, submit/withdraw feedback and stale-edit protection.

- Approved marketplace browse/search/filter/sort/pagination, listing details and fresh WhatsApp contact checks. Demo inventory lives under `/demo`.

## Remaining, in order
1. **Admin review UI:** connect the existing MFA-protected approval/rejection backend; show rejection reasons to owners. Prepare the dashboard UI prompt for the user's chosen agent when the review queue and admin sign-in contracts are ready. Optional racket specifications remain to connect.
2. **Marketplace controls:** reserved/sold/traded/archive/relist, public profiles/aliases/QR, reports, hide/suspend, configurable limits and basic views/contact counts. Clicks are not successful sales.
3. **Production readiness:** recovery, Google login, external email, deletion flows, abuse protections, backups/restore, monitoring and final accessibility/privacy/security checks.
4. **Hosted pilot:** user-approved hosting/costs, secrets/domain/config, migrations, smoke tests and rollback readiness.

No new specialist orchestration or handoff reports. Keep one dependent feature in progress. No checkout, payments, automatic expiry or automatic deletion of saved photos. Seller-reported deal counts still require a product decision.

Current next milestone: admin review UI. Detailed progress/checks: PROGRESS.md. Local account/photo run instructions: LOCAL_ACCOUNTS.md and PHOTOS.md.
