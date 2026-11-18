# PadelHub — Final Product and Engineering Plan

Approved product and engineering plan supplied by Ziad on 2026-11-13.

**Execution gate resolved (2026-11-13):** Three visual directions were presented. Ziad selected Sport-focused, with a much friendlier, more comfortable feel, dark-mode support, maintainable file organization and a continuously updated Markdown handoff. Local foundation implementation may proceed. See DESIGN_SPEC.md and PROGRESS.md. Do not create paid services or publish without relevant authorization.

## 1. Product brief and scope
Build an Egypt-first, Arabic/English responsive website for players and businesses to sell padel rackets and balls, with racket swaps secondary. Currency EGP. It is a connection bridge: anonymous visitors browse, tap WhatsApp, and arrange payment/meeting directly with sellers. No platform checkout, commissions, delivery, escrow or inventory reservations. Website first; native mobile later.

Launch free for individuals and businesses. Later validate featured listings (initial hypothesis 50–100 EGP for three days) and monthly business accounts, but implement no payments or monetization now. No internal messaging, push notifications, automatic matching, multi-user business teams, public ratings, court booking or native app in MVP.

One owner per seller profile. Google and verified email/password sign-in. Browsing and WhatsApp contact do not require login. Profiles may be created before selling; public visibility is opt-in. Unique usernames, shareable profile links and QR codes are central.

Manual approval by Ziad before publication remains required; disregard the earlier suggestion about toasts replacing approval. Listings never expire automatically. Saved listing/profile images must not be deleted automatically.

Core journey: create profile → submit listing → admin review → approve → share/profile discovery → WhatsApp inquiry → seller marks sold/traded.

Pilot targets, not promises or CV claims: 20 listings from 10 sellers, 5 sellers reporting inquiries, 3 reported deals; interview 5 buyers and 5 sellers. Sales are self-reported, not verified by WhatsApp clicks.

## 2. Stage 0 — UI exploration before implementation
Present three coherent visual directions using the same illustrative content:
1. Clean equipment marketplace: light surfaces, prominent prices, clear search and filters.
2. Sport-focused: strong typography, dark navigation and green accents.
3. Seller-profile-first: identity, personal storefronts and sharing prominent.

Show desktop/mobile marketplace, product details and public seller profile for each direction. Use actual visual previews or accessible references, not just labels. Wait for Ziad's choice before scaffolding. Finalize selected colors, typography, spacing, controls, cards, forms, navigation, mobile filters, Arabic RTL, loading/empty/error states and moderation states. Deliver a design specification. Do not use fake business metrics or testimonials as real content.

## 3. Product behavior
### Accounts and profiles
Individual/business profile with unique username, display name, photo, bio, governorate/district, optional favorite racket, WhatsApp number and explicit public-contact consent. Visibility defaults private; users may publish an empty profile. A business label does not imply verified identity.

Username: 3–24 Latin letters/digits/underscores, case-insensitive uniqueness enforced by DB; reserve admin/system routes. Display names support Arabic. MVP usernames are fixed after creation. Shareable links use `/@username` without a language prefix; the visitor chooses the display language. Permanent public profile IDs remain stable. Future QR links target that ID; username changes and alias/reuse policy are deferred. Private/suspended profiles must not leak through aliases, QR or metadata. Native share/copy link and social metadata. Explain that public WhatsApp numbers become visible when contacted.

### Listings
Common fields: category, title, brand, description, location, new/used condition, disclosures, photos and seller contact.
Rackets: model, damage/repair disclosure, sale/swap/both; price required for sale/both, negotiable flag, desired swap description. 3–6 photos covering faces/frame. Optional year/shape/weight/purchase date; unknown values left blank.
Balls: brand/model, condition, quantity/packaging, price for the whole stated offer, 1–6 photos. Sale only. Describe availability manually; no checkout stock reservation.
Curated brands plus Other; model free text.
Initial configurable limits: 5 active+pending individual listings, 20 business listings.

MVP lifecycle: draft, pending, active, sold, traded, archived; admin rejection/removal. Only approved active listings appear in marketplace search. Rejections have reasons and allow correction/resubmission. Content edits of approved listings take them off public discovery pending re-review. Sellers can mark listings sold/traded or archive them immediately. Reservation and available-again controls are deferred until after MVP (decision: 2026-11-18). Relisting sold/traded/archived requires approval.
No automatic expiry. Optional manual availability confirmation with timestamp. Sold/traded pages clearly disable inquiries. Moderation checks completeness/appropriateness; it is not a product or seller guarantee.

### Images and storage
Persist uploads to saved drafts. Support bounded JPEG/PNG/WebP uploads; validate actual content, re-encode, strip metadata, produce appropriate display sizes. Show upload progress, retry and actionable errors. Keep pending media private; approved listing media public. Failure uploading a replacement must preserve the existing image.

No scheduled deletion of images attached to saved drafts, profiles or listings. Rejected listing images remain available for correction. Users can explicitly delete drafts/images/accounts. Admin can manually clean orphaned/abusive uploads after checking references; no blanket 24-hour cleanup job. Quota pressure triggers review/upgrade, not deletion. Removing public images cannot revoke copies already downloaded.

### Marketplace and contact
Search titles/models/brands/descriptions. Filter category, location, price, condition, brand and listing type; racket-specific filters where relevant. Sort newest/price ascending/descending. URL-persist filters/back navigation, 24 items/page. Exclude swap-only listings when applying numeric price filtering, with clear explanation.
Product gallery, disclosures, seller summary, availability timestamp, report action.
Generate safe WhatsApp destination server-side with listing title/link; never accept arbitrary redirect URLs. Disabling seller public contact removes listings from active discovery. Track approximate contact attempts, never claim they are completed sales. Analytics failure must not block contact.

### Dashboards and moderation
Seller dashboard: manage listings/status, edit profile, share QR/link, approximate views/contact clicks.
Admin: review/approve/reject with reasons, handle reports, suspend users/hide profiles, configurable limits and audit log.
Conduct manual pilot deal follow-up. Do not introduce verified-sale/reputation badges until a defensible verification process exists.

## 4. Engineering architecture and operations
Single modular Next.js/TypeScript app with server-side domain logic. Supabase PostgreSQL/Auth/Storage; Railway Node hosting. Resend custom SMTP. Tailwind, accessible UI primitives, next-intl, Zod, Vitest, Playwright and GitHub Actions.
Start Supabase Free for pilot. Railway hosting is separate from Supabase database/auth/storage. Reaching Supabase limits is not a simple switch to Railway: compare upgrading with a planned migration. Maintain versioned SQL migrations and documented media export/manifest to preserve portability.

Data domains: private account/contact details, public profiles and username aliases, category-specific listings, image/upload records, reports/moderation audit, approximate view/contact events. Versioned mutation interfaces for profiles, listings, uploads, contact, reports and moderation. Return only approved/public fields publicly. Enforce server authorization and database RLS; transactional writes and version/conflict checks prevent races/stale overwrites.

Security: admin MFA; server-only secrets; rate limits on auth, listing creation, uploads, reports and contact endpoints; CSRF protections appropriate to auth; plain-text user content/XSS controls; validate files; private logs; documented account deletion and marketplace rules. Check ownership for every mutation and media access. Admin-only permissions cannot be controlled by user-editable metadata.

Budget estimate, not a guarantee: roughly USD5–15/month early, excluding domain/tax/backup/usage overages. Recheck current provider pricing before setup. Prior planning references: Supabase Free 500MB DB/1GB storage with inactivity pause; Railway minimum USD5 usage credits with additional usage charged; Resend free 3,000 emails/month with 100/day limit. Configure custom SMTP rather than relying on Supabase development email limits.
References: https://supabase.com/pricing ; https://supabase.com/docs/guides/auth/auth-smtp ; https://supabase.com/docs/guides/platform/backups ; https://railway.com/pricing ; https://resend.com/pricing .

Track storage/DB/egress/email/hosting consumption; warn around 70% quota and review weekly. Structured error reporting, health checks and deployed smoke checks. Daily encrypted database backup and separate media backup to private independent storage, keep 7 daily copies; test restore and rollback. Database backups alone do not include storage object contents. Target recovery point 24h and recovery time one working day. Backup retention must not delete live user images. Confirm domain/brand availability before public launch; PadelHub is working name.

## 5. Delivery stages and acceptance
Estimate 4–6 weeks part-time (10–15h/week), reassess after UI selection. Do not cut authorization/data safety to hit dates.

Stage 1 — Product specification and foundation:
Interview 5 sellers/3 buyers; document requirements/exclusions/decisions/backlog. Use this dedicated project rather than the CV repository. Migrations, bilingual shell, auth/custom SMTP, CI and hosting. Acceptance: external account can verify/sign in/recover; private data inaccessible to other users.

Stage 2 — Seller and moderation flow:
Profiles, category forms, image uploads, submission/approval and shareable QR. Acceptance: real seller submits and admin approves a listing end-to-end.

Stage 3 — Buyer journey:
Discovery, URL filters, listing/profile detail, WhatsApp and resilient analytics, bilingual mobile accessibility. Acceptance: anonymous buyer can find a real listing and contact the right seller on mobile.

Stage 4 — Operational reliability:
Lifecycle/re-review/manual confirmation, reports/suspension, dashboards, monitoring, quotas, backups and stated image retention. Acceptance: failures/retries preserve data and statuses/contact remain consistent.

Stage 5 — Private pilot and release testing:
Cover auth verification/recovery; cross-account listing/media access; admin permissions; username races and stale edits; aliases/QR/private/pending visibility; category price/swap rules; invalid and interrupted uploads and replacement failures; no automatic listing expiry or attached-image deletion; re-review after edits; status/contact rules; search/filters; RTL/keyboard; physical Android/iPhone; correct WhatsApp even when analytics fails; backup restore/rollback.
CI: lint, type checks, unit/policy tests, production build and critical browser tests against disposable local test services.
Release gate: no known authorization/data-loss defects; external email works; mobile critical journeys work; restore demonstrated; pilot users can self-serve.

Stage 6 — Controlled launch:
Permissioned real inventory, targeted community outreach, daily moderation, monitor cost/errors/inquiries, gather feedback. Record actual outcomes only for portfolio/CV; keep test/demo data distinct.

Handoff deliverables inside future repository:
PRD/exclusions, approved UI design, user journeys, prioritized backlog with acceptance criteria, architecture decisions, data model/migrations, interface and permission documentation, tests, launch checklist, operating/restore/rollback runbooks, risk/decision log and pilot metrics definition.

Later phases: improve market liquidity first, validate paid placements/business demand, then separately approve billing; consider staff access, alerts and credible reputation later.

## Account terminology clarification — approved 2026-11-17

Every account can buy and sell. There is no exclusive buyer/seller role selection; anonymous visitors may browse/contact. UI uses Account type / نوع الحساب with Personal / شخصي and Business / نشاط تجاري. The profile heading is Your profile / ملفي الشخصي. Explain: You can buy and sell with the same account / تقدر تبيع وتشتري بنفس الحساب. This is a wording clarification; internal individual/business values and configurable 5/20 active+pending limits remain unchanged. Business status does not imply verification.
