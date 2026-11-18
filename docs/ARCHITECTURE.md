# Application organization

One modular Next.js App Router application with TypeScript strict mode. No separate API service or monorepo is needed for the pilot.

```text
src/
  app/
    [locale]/
      about/page.tsx
      equipment/[id]/page.tsx
      sellers/[username]/page.tsx
      layout.tsx
      page.tsx
    globals.css
    icon.svg
  components/
    layout/
      brand.tsx
      preferences.tsx
      site-footer.tsx
      site-header.tsx
    providers/
      theme-provider.tsx
    sections/
      community-cta-section.tsx
      faq-section.tsx
      features-section.tsx
      hero-section.tsx
      how-it-works-section.tsx
      inspection-showcase.tsx
    ui/
      section-header.tsx
  features/
    marketplace/
      category-pills.tsx
      demo-data.ts
      equipment-art.tsx
      equipment-detail-view.tsx
      listing-card.tsx
      marketplace-page.tsx
      search-panel.tsx
      seller-profile-view.tsx
  i18n/
    navigation.ts
    request.ts
    routing.ts
  lib/
    format.ts
  proxy.ts
```

- `src/app/[locale]`: localized routes and thin page composition.
- `src/components/layout`: site-wide header, footer, brand mark, and locale/theme preference controls.
- `src/components/providers`: client context providers (`theme-provider.tsx`).
- `src/components/sections`: marketing and product education sections.
- `src/components/ui`: reusable presentational primitives (`section-header.tsx`).
- `src/features/marketplace`: equipment domain UI, explicitly typed demo fixtures, URL search/category filtering, and detail/seller views. Future production repository functions must be separate from fixtures.
- `src/lib`: shared formatting helpers (`format.ts`).
- `src/i18n` & `messages`: supported locales (`en`, `ar`), request messages, and localized navigation.
- `tests/e2e`: Playwright browser behavior tests (`foundation.spec.ts`).
- `docs`: canonical product, design, architecture, and live handoff documentation (`PROGRESS.md`, `PRODUCT_PLAN.md`, `DESIGN_SPEC.md`, `ARCHITECTURE.md`).

Add `src/server` for server-only integrations and `supabase/migrations` when database work starts. Do not introduce empty service/repository wrappers.

## Boundaries and deployment
Server-render routes and filter data on the server. Theme selection (`Preferences`) and the interactive disclosure showcase (`InspectionShowcase`) are small client islands. next-intl owns locale routing and message lookup. Tailwind v4 (`@theme inline`) and semantic CSS tokens in `src/app/globals.css` provide the shared visual vocabulary.

Use the supported Webpack bundler (`next dev --webpack` / `next build --webpack`). TypeScript 6.0.3 is pinned for lint-tool compatibility.

Frontend preview deployment is connected to GitHub `main` on Vercel (`padel-hub-beta.vercel.app`, `zeyadkhaled2s-projects` Hobby workspace) using `vercel.json` and `.vercelignore`. Keep `noindex` until demo inventory is replaced and the launch gates in `PRODUCT_PLAN.md` are met. No Supabase, Railway, or Resend resources are provisioned yet.

## Local accounts integration — 2026-11-17

- Thin localized `/auth/signin`, `/auth/signup`, `/auth/callback` and `/account` routes compose `src/features/auth` and `src/features/profile`.
- `src/server/supabase` owns server-only configuration, cookie-backed clients, session verification and refresh. Dedicated PADELHUB variables avoid falling back to an unrelated hosted environment. No service-role client is used by these account flows.
- Server Actions validate inputs and invoke owner RPCs under the user's verified session. Profile, username and contact saves remain separate atomic operations with expected versions; stale conflicts require explicit reload/review.
- Private account/auth responses are dynamic/no-store with noindex metadata. Demo marketplace data remains separate; account settings do not yet expose real public storefronts.
- `tests/e2e/account.spec.ts` exercises actual local Auth/Mailpit confirmation, account isolation, cookie refresh, form persistence and conflicts. See LOCAL_ACCOUNTS.md for setup; hosted auth and recovery remain future work.

## Equipment photos — current implementation

`src/features/photos` owns the synchronous image processing, draft photo page and controls; `src/app` contains thin routes. `scripts/local-app.mjs` provides repeatable local setup/start/test without changing `.env.local`. Validated photo variants are stored privately, then attached by a service-only transactional RPC after ownership/version checks. Browser clients cannot supply processed manifests. Public delivery requires an exact approved attachment and fresh eligibility checks; the optimizer only accepts fixed repository artwork. No background worker system is implemented. See PHOTOS.md.

## Listing editor

`src/features/listings` contains owner listing summaries, category-specific forms and authenticated Server Actions. Thin `/account/listings` routes use the existing draft/save/submit/withdraw RPCs; migration 008 adds only the owner summary query. Ownership and expected versions are checked in the database; stale forms retain input and require reload. Photo management remains in the existing photo page. Public browsing is implemented; a minimal admin review UI now exists; dashboard visual refinement remains.

## Public buyer journey

Migration 009 provides explicit public listing projections under a read-only capability. Browse, detail and contact share approved-content/media, profile visibility, account status and consent checks. Anonymous browse uses the publishable key; only the server contact redirect reads a consented phone number. No shared caching is used for inventory/contact or protected photos. `/demo` owns all illustrative inventory; the main marketplace never falls back to demo records. `/api/contact/[id]` creates only a fixed `https://wa.me/` destination and rechecks eligibility on each request. Public seller profiles and analytics remain unfinished.

## Admin review

`src/features/admin` owns MFA enrollment/challenge and the minimal queue/review UI. Migration 010 adds role/MFA access status, paginated pending summaries, authorized photo reads and owner rejection reasons. All decisions still use migration 005 snapshot/version checks. Admin photo delivery reuses the bounded, hash-verified private proxy; it rechecks the session-authorized RPC before returning bytes. No role provisioning endpoint is exposed. See ADMIN_REVIEW.md for operations and the UI refinement prompt.
