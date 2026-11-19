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
      accordion.tsx       # shadcn/ui Accordion (Radix UI)
      avatar.tsx          # shadcn/ui Avatar (Radix UI)
      badge.tsx           # shadcn/ui Badge (cva + Radix Slot)
      button.tsx          # shadcn/ui Button (cva + Radix Slot)
      card.tsx            # shadcn/ui Card family
      input.tsx           # shadcn/ui Input
      label.tsx           # shadcn/ui Label
      native-select.tsx   # shadcn/ui NativeSelect for native GET forms & theme combobox
      section-header.tsx
      separator.tsx       # shadcn/ui Separator (Radix UI)
      tabs.tsx            # shadcn/ui Tabs (Radix UI)
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
    utils.ts              # shadcn/ui cn() helper (clsx + tailwind-merge)
  styles/
    tokens.css            # @custom-variant dark, @theme inline + shadcn/ui light/dark semantic tokens
    base.css              # @layer base element defaults, container, skip link, equipment-art & reduced motion
    sections/
      hero.css            # courtside gradient backdrops, 2.5D parallax transforms & float keyframes
  proxy.ts
components.json           # shadcn/ui CLI configuration (New York, Tailwind v4, Lucide, CSS variables)
```

- `src/app/[locale]`: localized routes, self-hosted `next/font/google` variable font setup (`Outfit`, `Plus Jakarta Sans`, `Cairo` in `layout.tsx`), and thin page composition.
- `src/components/layout`: sticky translucent site header (`site-header.tsx`), route-aware navigation (`header-nav.tsx`), footer (`site-footer.tsx`), brand mark (`brand.tsx`), and locale/theme preference controls (`preferences.tsx`).
- `src/components/providers`: client context providers (`theme-provider.tsx` wrapping `next-themes` and Radix `DirectionProvider` synced to locale `dir`).
- `src/components/sections`: marketing and product education sections (`hero-section.tsx`, `hero-stage.tsx`, `inspection-showcase.tsx`, `features-section.tsx`, `how-it-works-section.tsx`, `faq-section.tsx`, `community-cta-section.tsx`), built on `shadcn/ui` primitives and Tailwind v4 utilities.
- `src/components/ui`: project-owned `shadcn/ui` primitive pillar (`button`, `badge`, `card`, `input`, `label`, `native-select`, `tabs`, `accordion`, `avatar`, `separator`, plus `section-header`). Additional components can be installed cleanly via `npx shadcn@latest add <component>` using `components.json`.
- `src/features/marketplace`: equipment domain UI, explicitly typed demo fixtures, URL search/category filtering, and detail/seller views (`search-panel.tsx`, `category-pills.tsx`, `listing-card.tsx`, `marketplace-page.tsx`, `equipment-detail-view.tsx`, `seller-profile-view.tsx`), composed with `shadcn/ui` primitives. Future production repository functions must be separate from fixtures.
- `src/lib`: shared helpers (`format.ts` for locale EGP formatting, `utils.ts` for `cn()`).
- `src/styles`: core CSS architecture imported by `src/app/globals.css` (`tailwindcss`, `tw-animate-css`, `tokens.css`, `base.css`, and `sections/hero.css`).
- Styling conventions: UI prioritizes `shadcn/ui` primitives from `@/components/ui/*` and standard semantic Tailwind v4 tokens (`bg-background`, `text-foreground`, `bg-card`, `text-card-foreground`, `bg-primary`, `hover:bg-primary-hover`, `text-primary-foreground`, `bg-secondary`, `bg-muted`, `text-muted-foreground`, `bg-accent`, `text-accent-foreground`, `border-border`, `border-border-strong`, `border-input`, `ring-ring`, plus PadelHub extensions `text-brand`, `text-coral`, `bg-court-gold`, `text-court-gold-foreground`, `bg-gold-soft`, `font-sans`, `font-display`). Use logical utilities (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`) and `rtl:` only where direction truly needs it, so Arabic RTL and light/dark keep working. Theme switching is driven by `[data-theme="dark"]` with `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));` defined in `tokens.css`. Element defaults in `base.css` live in `@layer base` so Tailwind `@layer utilities` override them cleanly. Preserve class hooks used by tests (`listing-card`, `equipment-art`).
- `src/i18n` & `messages`: supported locales (`en`, `ar`), request messages, and localized navigation.
- `tests/e2e`: Playwright browser behavior tests (`foundation.spec.ts`).
- `docs`: canonical product, design, architecture, and live handoff documentation (`PROGRESS.md`, `PRODUCT_PLAN.md`, `DESIGN_SPEC.md`, `ARCHITECTURE.md`).

Add `src/server` for server-only integrations and `supabase/migrations` when database work starts. Do not introduce empty service/repository wrappers.

## Boundaries and deployment
Server-render routes and filter data on the server. Active nav highlighting (`HeaderNav`), theme selection (`Preferences`), Radix-backed interactive primitives (`Tabs` in `InspectionShowcase`, `Accordion` in `FaqSection`, `Avatar`, `Separator`), and fine-pointer hero parallax (`HeroStage`) are small client islands. next-intl owns locale routing and message lookup. Tailwind v4 (`@theme inline`) and standard `shadcn/ui` CSS tokens in `src/styles/tokens.css` (imported by `src/app/globals.css`) provide the shared visual vocabulary.

Use the supported Webpack bundler (`next dev --webpack` / `next build --webpack`). TypeScript 6.0.3 is pinned for lint-tool compatibility.

Frontend preview deployment is connected to GitHub `main` on Vercel (`padel-hub-beta.vercel.app`, `zeyadkhaled2s-projects` Hobby workspace) using `vercel.json` and `.vercelignore`. Keep `noindex` until demo inventory is replaced and the launch gates in `PRODUCT_PLAN.md` are met. No Supabase, Railway, or Resend resources are provisioned yet.
