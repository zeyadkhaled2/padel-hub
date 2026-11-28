# Raketna / PadelHub — project handoff

Updated 2026-11-28. This is a navigation and continuation guide, not a replacement for the detailed records or fresh validation.

## Start here

Read `AGENTS.md`, then `docs/PROGRESS.md`, `docs/PRODUCT_PLAN.md`, `docs/DESIGN_SPEC.md` and `docs/ARCHITECTURE.md`, in that order. Progress entries are historical: newer explicit decisions override older plans. Inspect Git status before edits and preserve existing work. Do not infer deployed status from local tests.

## Product and audience

The repository is named PadelHub; the current user-facing brand is **Raketna / راكتنا**. Build an Egypt-first, mobile-friendly Arabic/English marketplace connecting padel players and businesses. Equipment categories are rackets, balls, shoes and bags. Prices are EGP. Rackets support sale/swap; the other categories are sale-only. Anonymous users can browse and contact consenting sellers through WhatsApp; payment and handover happen outside the platform.

Every account can buy and sell. Personal/Business is an account type, not an exclusive buyer/seller role or verification badge. Profiles start private. Public profiles, fixed usernames and shareable QR links support seller discovery.

## Product rules that must survive every change

- Manual listing approval. Submitting does not publish. Approved listing content edits require re-review. Only approved active listings appear publicly.
- No checkout, escrow, delivery, payment collection, commissions or automatic stock reservation. Paid placement/billing and other roadmap ideas need separate authorization.
- No automatic listing expiry or deletion of images attached to saved records. Preserve data during errors, retries, rejection and replacement.
- Keep live data separate from explicitly labeled demo inventory. Do not invent testimonials, demand, conversion results or verified sales.
- Moderation checks completeness/rules, not authenticity, seller identity or physical condition. No guarantees of sale, condition or approval speed.
- Ownership checks, server authorization, validation, RLS and stale-write/conflict protection on mutations. Never derive admin authority from user-editable metadata.
- Preserve private-by-default profiles, contact consent, secure media access, lifecycle/contact restrictions and account-deletion protections.

## Design and content direction

Approved feel: sport-focused, friendly and comfortable, with light/dark themes. Keep the minimal courtside marketplace layout, existing rounded R monogram and wordmark geometry, restrained motion, clear prices, usable native controls and accessible target sizes.

Latest owner decision: **Electric cobalt**, chosen over Court blue because it feels more lively. Apply it on the separate `codex/color` branch for review before merge. Light action/monogram `#2455D6`, pale blue `#EDF2FF`, navy text `#14234B`. Dark action `#94B0FF` with navy label `#101B35`, dark canvas `#0E1629`. Exact roles are in DESIGN_SPEC.md and globals.css. Green/amber/red remain semantic status colors. Product photography and archived PadelHub assets are not recolored.

Use `.agents/skills/calm-nextjs-design/SKILL.md` for visual refinement. Keep layout, typography and functionality stable during the color work. Avoid reintroducing the rejected floating 3D/glow-heavy direction.

Copy: plain English and natural Egyptian Arabic. Use «راكت» / «راكتات», «شنط», «إعلان» and «تبديل». Preserve translation keys, ICU variables, precise privacy/legal/security language and Arabic RTL. Current discovery lead is “Your next racket is waiting.” / «راكتك الجاي مستنيك.»

## Engineering structure

Next.js App Router, TypeScript, React, Tailwind semantic tokens, next-intl and next-themes. Supabase supplies database/auth/storage; hosting and email setup are separate operational concerns. Read relevant installed Next.js guides in `node_modules/next/dist/docs/` before coding: this repository warns of breaking API changes.

- `src/app`: thin routes/layout and global tokens.
- `src/features/<domain>`: domain UI and logic.
- `src/components`: shared UI, layout and sections.
- `src/i18n` and `messages`: locale setup and bilingual text.
- `src/server`: server-only authorization/integrations; secrets stay server-side.
- `supabase`: versioned migrations and database checks.
- `tests`, `scripts`, `docs`: verification and operational records.

Prefer Server Components. Add client code only for actual interaction/browser state. Add no speculative folders or dependencies. Keep secrets, dependencies, caches and build output uncommitted.

## Existing capability baseline

The progress records describe implemented accounts/recovery, private profiles and contact consent; seller listing editing and media handling; manual moderation and MFA administration; public discovery/filter/sort/pagination; listing details and consent-checked WhatsApp redirects; public seller profiles and QR sharing; reports/lifecycle/account-deletion workflows; ownership and conflict protections; and approximate analytics. Consult the detailed progress and tests for coverage and limitations rather than assuming every feature is production-ready.

Recent main changes include marketplace search/control refinement, direct theme/language controls, streamed product grid skeletons, and English/Arabic content refinement. The color worktree was created from local `origin/main` at `116328c` (content refinement). This is a local base reference, not proof that the remote is still at that commit.

## Workspaces and current color task

- Active isolated worktree: `C:\Users\COMPUMARTS\.codex\worktrees\color\padelHub`.
- Branch: `codex/color`.
- Original checkout: `E:\projects\padelHub`, with unrelated staging/uncommitted work. Leave it intact.
- Changed color files: `src/app/globals.css`; `public/brand/raketna-logo.svg`, `raketna-logo-light.svg`, `raketna-icon.svg`; `src/app/icon.svg`, `favicon.ico`, `apple-icon.png`; `public/apple-touch-icon.png`; and `docs/DESIGN_SPEC.md`.
- Inline logo inherits theme tokens; fixed light/dark logo CSS was updated too. SVG paths remain unchanged. Favicon has 16/32/48px PNG entries; Apple assets are 180px.
- Dependencies were copied locally after a cross-drive node_modules junction caused Next.js resolution errors. No package or lockfile change was needed.
- Ignored `.cache/color/playwright.config.ts` points to `http://127.0.0.1:3135`, with no server auto-start. `.cache/color/visual.mjs` checks EN/AR × light/dark × 320/390/768/1440px, overflow, preference target sizes, page errors and semantic contrast pairs, and captures screenshots. These helpers are local diagnostics, not committed regression tests.

## Current validation / next actions

Final color validation: `npm run check` passed (lint/typecheck/build, 37 routes); foundation/preferences Chrome tests passed 20/20; the local diagnostic passed 16 marketplace locale/theme/width combinations and four narrow sign-in layouts, with no page errors or horizontal overflow. It checks 19 semantic contrast pairs per marketplace case. Inspected final EN desktop light, AR mobile dark and Apple icon images. Initial cross-drive dependency resolution, sandbox build EPERM and loopback networking failures were resolved by local dependency copies and authorized execution. Screenshots were retaken with animations disabled to avoid capturing intermediate theme-transition colors. Physical devices, Safari, authenticated seller/admin pages and hosted deployment were not checked.

The next action is owner review of the color branch before merge. The commands below are the verification procedure for further edits, not unfinished checks. The local production preview was left running at `http://127.0.0.1:3135/en/demo` (Arabic: `/ar/demo`); restart it if the process has ended. No push, merge or deployment was performed.

Continue in this order:

1. Finish `npm run check`; request execution permission if sandbox filesystem restrictions recur. Do not treat an EPERM as an application fix or weaken checks.
2. Start the built app locally: `npm run start -- --hostname 127.0.0.1 --port 3135`.
3. Run Chrome foundation/preferences tests using `.cache/color/playwright.config.ts`, then the local visual script. Recreate the diagnostic config if caches are absent. Run loading checks if the token changes affect skeleton readability.
4. Inspect actual screenshots in both themes/locales at narrow and desktop widths, plus keyboard focus, selected controls and form states. Check icon assets and contrast. Fix findings, then rerun checks affected by fixes.
5. Record exact passes, failures and limitations in PROGRESS. Finalize this handoff if validation status changes. Commit only scoped color/docs changes on `codex/color`; keep it available for owner review. Do not merge, publish or provision services without relevant authorization.

## Hosted readiness and follow-on work

Read `docs/STAGING_SETUP.md`, `docs/STAGING_READINESS_REPORT.md` and `docs/AUTH_DEPLOYMENT_RUNBOOK.md` before hosted operations. More recent hosted verification records may exist in the original staging checkout and its unmerged branch, rather than this main-based worktree. Reconcile those records before claiming the state is current; do not bulk-copy unrelated staging changes into the color branch.

Prior session evidence reported a protected Vercel staging Preview and a migrated Supabase staging project, with synthetic smoke tests passing. It also reported unresolved Supabase Auth hosted callback/recovery redirects returning loopback, owner action on Auth URLs, and unverified external inbox delivery/physical-device flows. Those claims are historical and were not rechecked in the color task. Production setup, SMTP/domain, commercial hosting eligibility and real-seller readiness remain separate release decisions. No claim of unrestricted launch readiness is justified by a palette change.

After color review: confirm hosted staging configuration and exact redirect behavior; verify permitted real inbox delivery and physical iPhone Safari/Android Chrome journeys; review restore/backup and launch gates; then proceed with a permissioned private pilot. Feature expansion and monetization remain out of scope until requested.

## Instructions for the next agent

Continue the existing task; do not redesign or restart the project. Read the source docs, inspect current branch/diff, verify which processes/checks have finished, and preserve unrelated work. Communicate meaningful progress and honest limits. Ask only for genuinely missing decisions or required authorization; routine reversible implementation and testing are already authorized. Never claim a test, deployment or user outcome that has not been verified. Update PROGRESS after each completed session.
