# Application organization

One modular Next.js App Router application with TypeScript strict mode. No separate API service or monorepo is needed for the pilot.

- `src/app/[locale]`: localized routes and thin page composition (`layout.tsx`, `page.tsx`, `about/page.tsx`, `equipment/[id]/page.tsx`, `sellers/[username]/page.tsx`); route-specific loading/error boundaries when needed.
- `src/components/layout`: site-wide structural shell (`site-header.tsx`, `site-footer.tsx`).
- `src/components/sections`: high-end marketing and product education sections (`hero-section.tsx`, `inspection-showcase.tsx`, `features-section.tsx`, `how-it-works-section.tsx`, `faq-section.tsx`, `community-cta-section.tsx`).
- `src/components/ui`: reusable presentational primitives (`section-header.tsx`).
- `src/components`: shared brand and theme/locale preference controls (`brand.tsx`, `preferences.tsx`, `theme-provider.tsx`).
- `src/features/marketplace`: equipment domain UI, explicitly typed demo fixtures, URL search/category filtering, and detail/seller views (`demo-data.ts`, `equipment-art.tsx`, `search-panel.tsx`, `category-pills.tsx`, `listing-card.tsx`, `marketplace-page.tsx`, `equipment-detail-view.tsx`, `seller-profile-view.tsx`). Future production repository functions must be separate from fixtures.
- `src/lib`: shared formatting and pure helpers (`format.ts`).
- `src/i18n`: supported locales, request messages and localized navigation.
- `messages`: English (`en.json`) and Arabic (`ar.json`) UI and marketing strings.
- `tests/e2e`: browser behavior tests (`foundation.spec.ts`).
- `docs`: product scope, design, architecture and live handoff log.

Add `src/server` for server-only integrations and `supabase/migrations` when database work starts. Do not introduce empty service/repository wrappers. Domain mutation interfaces, RLS and audit behavior will be designed before wiring production data.

## Boundaries
Server-render routes and filter data on the server. Theme selection (`Preferences`) and the interactive disclosure showcase (`InspectionShowcase`) are small client islands. next-intl owns locale routing and message lookup. Tailwind v4 (`@theme inline`) and semantic CSS tokens in `src/app/globals.css` provide the shared visual vocabulary. npm's committed lockfile pins dependency resolution.

Use the supported Webpack bundler for dev/build while the local Turbopack CSS subprocess failure is unresolved. TypeScript 6.0.3 is pinned because the installed lint integration rejects TypeScript 7. Keep tooling upgrades deliberate and rerun all checks after changes.

No Supabase, Railway or Resend resources are provisioned. No production account, upload, listing submission or contact endpoint exists. Local demo routes must never be mistaken for published inventory.

## Reference documentation
- Next.js setup: https://nextjs.org/docs/app/getting-started/installation
- next-intl routing: https://next-intl.dev/docs/routing/configuration

Consult current primary documentation before implementing integrations or changing framework APIs. Provider pricing must be rechecked before setup.
