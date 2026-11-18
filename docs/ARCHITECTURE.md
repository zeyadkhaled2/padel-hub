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
      header-nav.tsx
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
      hero-stage.tsx
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
    tokens.css            # @custom-variant dark, @theme inline + light/dark semantic & shadow tokens
    base.css              # @layer base element defaults, container, skip link, equipment-art & reduced motion
    sections/
      hero.css            # courtside gradient backdrops, 2.5D parallax transforms & float keyframes
  proxy.ts
```

- `src/app/[locale]`: localized routes, self-hosted `next/font/google` variable font setup (`Outfit`, `Plus Jakarta Sans`, `Cairo` in `layout.tsx`), and thin page composition.
- `src/components/layout`: sticky translucent site header (`site-header.tsx`), route-aware navigation (`header-nav.tsx`), footer (`site-footer.tsx`), brand mark (`brand.tsx`), and locale/theme preference controls (`preferences.tsx`).
- `src/components/providers`: client context providers (`theme-provider.tsx`).
- `src/components/sections`: marketing and product education sections (`hero-section.tsx`, `hero-stage.tsx`, `inspection-showcase.tsx`, `features-section.tsx`, `how-it-works-section.tsx`, `faq-section.tsx`, `community-cta-section.tsx`), all styled with Tailwind v4 utilities.
- `src/components/ui`: reusable presentational primitives (`section-header.tsx`).
- `src/features/marketplace`: equipment domain UI, explicitly typed demo fixtures, URL search/category filtering, and detail/seller views (`search-panel.tsx`, `category-pills.tsx`, `listing-card.tsx`, `marketplace-page.tsx`, `equipment-detail-view.tsx`, `seller-profile-view.tsx`), all styled with Tailwind v4 utilities. Future production repository functions must be separate from fixtures.
- `src/lib`: shared formatting helpers (`format.ts`).
- `src/styles`: core CSS architecture imported by `src/app/globals.css` (`tokens.css`, `base.css`, and `sections/hero.css`). All component-level layout and surface rules have been migrated to Tailwind v4 utilities and their legacy CSS partials removed.
- Styling conventions: UI uses Tailwind v4 utilities built on semantic tokens (`bg-base`, `bg-surface`, `bg-surface-soft`, `text-ink`, `text-muted`, `border-line`, `bg-accent`, `text-accent-ink`, `text-coral`, `bg-hero`, `text-hero-ink`, `bg-hero-stage`, `font-sans`, `font-display`). Use logical utilities (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`) and `rtl:` only where direction truly needs it, so Arabic RTL and light/dark keep working. Theme switching is driven by `[data-theme="dark"]` with `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));` defined in `tokens.css`. Element defaults in `base.css` live in `@layer base` so Tailwind `@layer utilities` override them cleanly. Preserve class hooks used by tests (`listing-card`, `equipment-art`).
- `src/i18n` & `messages`: supported locales (`en`, `ar`), request messages, and localized navigation.
- `tests/e2e`: Playwright browser behavior tests (`foundation.spec.ts`).
- `docs`: canonical product, design, architecture, and live handoff documentation (`PROGRESS.md`, `PRODUCT_PLAN.md`, `DESIGN_SPEC.md`, `ARCHITECTURE.md`).

Add `src/server` for server-only integrations and `supabase/migrations` when database work starts. Do not introduce empty service/repository wrappers.

## Boundaries and deployment
Server-render routes and filter data on the server. Active nav highlighting (`HeaderNav`), theme selection (`Preferences`), the interactive disclosure showcase (`InspectionShowcase`), and fine-pointer hero parallax (`HeroStage`) are small client islands. next-intl owns locale routing and message lookup. Tailwind v4 (`@theme inline`) and semantic CSS tokens in `src/styles/tokens.css` (imported by `src/app/globals.css`) provide the shared visual vocabulary.

Use the supported Webpack bundler (`next dev --webpack` / `next build --webpack`). TypeScript 6.0.3 is pinned for lint-tool compatibility.

Frontend preview deployment is connected to GitHub `main` on Vercel (`padel-hub-beta.vercel.app`, `zeyadkhaled2s-projects` Hobby workspace) using `vercel.json` and `.vercelignore`. Keep `noindex` until demo inventory is replaced and the launch gates in `PRODUCT_PLAN.md` are met. No Supabase, Railway, or Resend resources are provisioned yet.
