# PadelHub — Design Specification

## Visual direction and semantic tokens
PadelHub uses **shadcn/ui** (`components.json`, New York style, Tailwind CSS v4, unified `radix-ui`) as its primary UI component pillar, styled around top-performing resale marketplace conventions (**StockX × GOAT × KREAM × Vinted**): pure high-contrast neutral surfaces, sharp `6px–10px` commerce geometry (`--radius: 0.5rem`), monochrome primary actions, and **StockX Verified Green** strictly reserved for authenticity, trust, and brand accents (`next-themes` with `attribute="data-theme"` and `defaultTheme="system"`, plus Radix `DirectionProvider` synced to locale `dir` for native Arabic RTL). Standard shadcn CSS variables are exposed through Tailwind v4 `@theme inline` and `@custom-variant dark` in `src/styles/tokens.css` (imported by `src/app/globals.css`), with backward-compatible legacy aliases (`--canvas`, `--surface`, `--text`, `--focus`, `--hero`) preserved:

- **Light theme (`:root`) — StockX × GOAT Precision Commerce**:
  - `--background`: `#ffffff` (pure crisp white commerce canvas)
  - `--foreground`: `#0f0f10`
  - `--card` / `--popover`: `#ffffff` (`--card-foreground`: `#0f0f10`)
  - `--primary`: `#0f0f10` (`--primary-hover`: `#27272a`, `--primary-foreground`: `#ffffff` — high-contrast monochrome actions)
  - `--secondary` / `--muted`: `#f4f4f5` (`--muted-foreground`: `#52525b`)
  - `--accent`: `#eef7f3` (`--accent-foreground`: `#005536`)
  - `--destructive`: `#dc2626` (`--destructive-foreground`: `#ffffff`)
  - `--border` / `--input`: `#e4e4e7` (`--border-strong`: `#c4c4cc`)
  - `--ring`: `#006340`
  - Brand & status extensions: `--brand`: `#006340` (StockX Verified Green, 7.35:1 AAA on white), `--court-gold`: `#006340` (`--court-gold-foreground`: `#ffffff`, `--gold-soft`: `#eef7f3`), `--header`: `rgba(255, 255, 255, 0.94)`
- **Dark theme (`[data-theme="dark"]`) — StockX × GOAT Precision Commerce Dark**:
  - `--background`: `#09090b` (deep neutral carbon canvas)
  - `--foreground`: `#fafafa`
  - `--card` / `--popover`: `#111114` (`--card-foreground`: `#fafafa`)
  - `--primary`: `#fafafa` (`--primary-hover`: `#e4e4e7`, `--primary-foreground`: `#09090b` — high-contrast monochrome actions)
  - `--secondary` / `--muted`: `#18181c` (`--muted-foreground`: `#a1a1aa`)
  - `--accent`: `#0b261c` (`--accent-foreground`: `#34d399`)
  - `--destructive`: `#ef4444` (`--destructive-foreground`: `#ffffff`)
  - `--border` / `--input`: `#26262b` (`--border-strong`: `#3f3f46`)
  - `--ring`: `#17c981`
  - Brand & status extensions: `--brand`: `#17c981` (luminous verified emerald, 9.6:1 AAA on canvas), `--court-gold`: `#17c981` (`--court-gold-foreground`: `#032114`, `--gold-soft`: `rgba(23, 201, 129, 0.14)`), `--header`: `rgba(9, 9, 11, 0.92)`

## Typography and spacing
Self-hosted variable fonts loaded via `next/font/google` in `src/app/[locale]/layout.tsx` (zero runtime requests to Google):
- **Display & Pricing (`--font-display`)**: `Outfit` in English LTR; `Cairo` in Arabic RTL (`[dir="rtl"]`).
- **Body & UI Controls (`--font-sans`)**: `Plus Jakarta Sans` in English LTR; `Cairo` in Arabic RTL (`[dir="rtl"]`), with system sans fallbacks.
- Body 16px, line height 1.6; secondary text at least 11–12px. Headings use sentence case, fluid `clamp()` sizing, tight tracking in LTR, and zero letter-spacing with `1.3`–`1.38` line height in Arabic RTL. Primary interactive targets are at least 40–44px. Desktop content sits within a 1200px container.

## Responsive marketing and marketplace layout
1. **Crisp 64px Sticky Commerce Header (`SiteHeader`, `Brand`, `HeaderNav`, `Preferences`)**: Solid-surface hairline sticky bar (`border-b border-border`) with the sharp `rx="14"` StockX Verified Green + Optic Volt perforated-racket mark, `Outfit` wordmark, KREAM/StockX-style hairline bottom-underline route links (`HeaderNav`), shadcn `NativeSelect` theme combobox, and locale switcher preserving URL query parameters.
2. **Search-First Commerce Bar & Dark Editorial Billboard (`MarketplacePage`, `SearchPanel`, `CategoryPills`, `HeroSection`, `HeroStage`)**: Full-width top hairline utility bar exposing the native GET search form (`q`, `category`, `sort`) and sharp `6px` category filter buttons (`CategoryPills`) immediately below the header. Inside `.container`, a compact high-contrast dark obsidian merchandising billboard (`.hero-billboard`, `rounded-[12px]`) frames crisp white headline copy, verified emerald trust highlights, and the GPU-compositor-only 3D stage (`HeroStage`, `perspective: 1100px` camera rig, `IntersectionObserver` offscreen pause) showcasing the flagship 18K racket & 3 optic-yellow felt balls so product photos and bold EGP prices sit above the desktop fold.
3. **Commerce Equipment Grid (`ListingCard`)**: Sharp StockX × GOAT P2P cards (`rounded-[8px]`, `1px` hairline borders, `150ms` hover border highlight, zero resting shadow) in a responsive grid (`3` columns on `md:`, `2` on `≥360px`, `1` at `320px`) displaying a `4:3` photo frame with `4px` corner condition tags (`New` in Verified Green, `Used` in frosted ink), `Brand · Location` micro-line, model title stretched-link, bold `Outfit` tabular EGP price + `"For sale"` tag, and hairline seller footer.
4. **Product-First Detail View (`EquipmentDetailView`) & Seller Storefront (`SellerProfileView`)**: Asymmetric desktop detail layout (`1.25fr` / `0.85fr`) built from shadcn `Card`, `Badge`, `Button`, `Avatar`, and `Separator` primitives pairing a `3:2` photo showcase and disclosures card with a sticky price, structured 2-column specification tiles, seller card, and direct-contact preview notice. Seller profiles feature a sharp `10px` neutral storefront banner followed by the 3-column listing grid.
5. **Borderless Hairline Trust & Explainer Sections (`InspectionShowcase`, `FeaturesSection`, `HowItWorksSection`, `FaqSection`, `CommunityCtaSection`, `SiteFooter`)**: Separated by crisp `border-t border-border` rules rather than nested SaaS card walls—sharp `8px` Radix `Tabs` inspection split, editorial feature rows, 3-column numbered hairline workflow (`01`/`02`/`03`), borderless Radix `Accordion` FAQ, matching dark obsidian bottom CTA strip, and compact footer.

## Brand and demo artwork provenance
- `public/brand/padelhub-mark.svg` and `src/app/icon.svg`: Custom code-native SVG mark (perforated white racket and Optic Volt `#D4F838` ball on a sharp `#006340` StockX Verified Green square). Proposed identity, not a claim of trademark registration.
- `public/images/hero/padel-racket-flagship.webp`, `padel-ball-far.webp`, `padel-ball-mid.webp`, and `padel-ball-near.webp`: Generated unbranded photorealistic studio renders (flagship aluminized 18K woven carbon pro-tour racket with emerald/volt trim and 3 distinct fuzzy felt padel balls) chroma-keyed to transparent WebP (**74.1 KB source**, **~12.5 KB combined AVIF over the wire**) for the 3D hero stage (`HeroStage`). Decorative marketing imagery, not real inventory.
- `public/images/demo/racket-court.webp`, `racket-coral.webp`, and `balls.webp`: Generated unbranded editorial illustrations optimized to `960×640` WebP (**313 KB source**, served as AVIF/WebP via `next/image` with 1-year `minimumCacheTTL`). Detail captions explicitly note they are AI demo imagery, never evidence of condition or depictions of the named models.

## Required state behavior
- **Loading / Empty / Error**: Stable geometry, respect `prefers-reduced-motion`, explain why no listings match with a filter reset link, and retain entered inputs.
- **Moderation & Lifecycle (Stage 2–4 backlog)**: Draft/pending listings stay private; rejected listings retain images for correction; active listings require manual approval and public-contact consent; reserved/sold/traded states disable contact.
