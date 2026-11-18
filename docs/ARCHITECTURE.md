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
  styles/
    tokens.css            # @theme inline + light/dark semantic tokens
    base.css              # reset, element defaults, container, skip link
    responsive.css        # breakpoints + reduced motion (imported last)
    layout/               # header.css, footer.css
    marketplace/          # search.css, listings.css
    pages/                # detail.css (equipment detail + seller profile)
    sections/             # hero, inspection, features, how-it-works, faq, community
  proxy.ts
```

- `src/app/[locale]`: localized routes and thin page composition.
- `src/components/layout`: site-wide header, footer, brand mark, and locale/theme preference controls.
- `src/components/providers`: client context providers (`theme-provider.tsx`).
- `src/components/sections`: marketing and product education sections.
- `src/components/ui`: reusable presentational primitives (`section-header.tsx`).
- `src/features/marketplace`: equipment domain UI, explicitly typed demo fixtures, URL search/category filtering, and detail/seller views. Future production repository functions must be separate from fixtures.
- `src/lib`: shared formatting helpers (`format.ts`).
- `src/styles`: global CSS partials grouped like the components they style. `src/app/globals.css` is only the ordered `@import` entry; import order is the cascade order, so keep `tokens.css`/`base.css` first and `responsive.css` last. Add new rules to the partial for that area rather than to `globals.css`.
- `src/i18n` & `messages`: supported locales (`en`, `ar`), request messages, and localized navigation.
- `tests/e2e`: Playwright browser behavior tests (`foundation.spec.ts`).
- `docs`: canonical product, design, architecture, and live handoff documentation (`PROGRESS.md`, `PRODUCT_PLAN.md`, `DESIGN_SPEC.md`, `ARCHITECTURE.md`).

Add `src/server` for server-only integrations and `supabase/migrations` when database work starts. Do not introduce empty service/repository wrappers.

## Boundaries and deployment
Server-render routes and filter data on the server. Theme selection (`Preferences`) and the interactive disclosure showcase (`InspectionShowcase`) are small client islands. next-intl owns locale routing and message lookup. Tailwind v4 (`@theme inline`) and semantic CSS tokens in `src/styles/tokens.css` (imported by `src/app/globals.css`) provide the shared visual vocabulary.

Use the supported Webpack bundler (`next dev --webpack` / `next build --webpack`). TypeScript 6.0.3 is pinned for lint-tool compatibility.

Frontend preview deployment is connected to GitHub `main` on Vercel (`padel-hub-beta.vercel.app`, `zeyadkhaled2s-projects` Hobby workspace) using `vercel.json` and `.vercelignore`. Keep `noindex` until demo inventory is replaced and the launch gates in `PRODUCT_PLAN.md` are met. No Supabase, Railway, or Resend resources are provisioned yet.
