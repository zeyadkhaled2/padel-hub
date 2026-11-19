# PadelHub — Design Specification

## Visual direction and semantic tokens
PadelHub uses **shadcn/ui** (`components.json`, New York style, Tailwind CSS v4, unified `radix-ui`) as its primary UI component pillar, themed with our calm, professional **Club Blue & Warm Stone** (Light) and **Club Blue & Neutral Graphite** (Dark) palette (`next-themes` with `attribute="data-theme"` and `defaultTheme="system"`, plus Radix `DirectionProvider` synced to locale `dir` for native Arabic RTL). Standard shadcn CSS variables are exposed through Tailwind v4 `@theme inline` and `@custom-variant dark` in `src/styles/tokens.css` (imported by `src/app/globals.css`), with backward-compatible legacy aliases (`--canvas`, `--surface`, `--text`, `--focus`, `--hero`) preserved:

- **Light theme (`:root`) — Club Blue & Warm Stone**:
  - `--background`: `#f7f7f5` (warm alabaster page canvas)
  - `--foreground`: `#161e2e`
  - `--card` / `--popover`: `#ffffff` (`--card-foreground`: `#161e2e`)
  - `--primary`: `#2553b8` (`--primary-hover`: `#1e4499`, `--primary-foreground`: `#ffffff`)
  - `--secondary` / `--muted`: `#f1f2ee` (`--muted-foreground`: `#5a6577`)
  - `--accent`: `#eaf0fb` (`--accent-foreground`: `#2553b8`)
  - `--destructive`: `#c93b2b` (`--destructive-foreground`: `#ffffff`)
  - `--border` / `--input`: `#e3e5e9` (`--border-strong`: `#cdd2dc`)
  - `--ring` (`--color-coral`): `#d95b38`
  - Brand & courtside extensions: `--brand`: `#2553b8`, `--court-gold`: `#f2d15b` (`--court-gold-foreground`: `#2a2209`, `--gold-soft`: `#fbf4d8`)
  - Elevation shadows: `--shadow-card`, `--shadow-card-hover`, `--shadow-dock`
- **Dark theme (`[data-theme="dark"]`) — Club Blue & Neutral Graphite**:
  - `--background`: `#111317` (restful charcoal-graphite canvas)
  - `--foreground`: `#edf0f5`
  - `--card` / `--popover`: `#181c23` (`--card-foreground`: `#edf0f5`)
  - `--primary`: `#3465d8` (`--primary-hover`: `#4173e6`, `--primary-foreground`: `#ffffff` — WCAG AA solid action fills without pastel washout)
  - `--secondary` / `--muted`: `#1f242e` (`--muted-foreground`: `#98a3b6`)
  - `--accent`: `#1d283c` (`--accent-foreground`: `#7da8ff`)
  - `--destructive`: `#e05245` (`--destructive-foreground`: `#ffffff`)
  - `--border` / `--input`: `#282f3c` (`--border-strong`: `#394356`)
  - `--ring`: `#f08c6c`
  - Brand & courtside extensions: `--brand`: `#7da8ff` (high-legibility cobalt for links/icons on dark surfaces), `--court-gold`: `#d9ba4e` (`--court-gold-foreground`: `#1a1608`, `--gold-soft`: `rgba(217, 186, 78, 0.14)`)

## Typography and spacing
Self-hosted variable fonts loaded via `next/font/google` in `src/app/[locale]/layout.tsx` (zero runtime requests to Google):
- **Display & Pricing (`--font-display`)**: `Outfit` in English LTR; `Cairo` in Arabic RTL (`[dir="rtl"]`).
- **Body & UI Controls (`--font-sans`)**: `Plus Jakarta Sans` in English LTR; `Cairo` in Arabic RTL (`[dir="rtl"]`), with system sans fallbacks.
- Body 16px, line height 1.6; secondary text at least 11–12px. Headings use sentence case, fluid `clamp()` sizing, tight tracking in LTR, and zero letter-spacing with `1.3`–`1.38` line height in Arabic RTL. Primary interactive targets are at least 40–44px. Desktop content sits within a 1200px container.

## Responsive marketing and marketplace layout
1. **Sticky Marketplace App Bar (`SiteHeader`, `Brand`, `HeaderNav`, `Preferences`)**: Translucent sticky header (`backdrop-blur-md`) with the custom perforated-racket SVG mark + `Outfit` wordmark, route-aware shadcn `Button` navigation (`HeaderNav`), shadcn `NativeSelect` theme combobox with live theme icons, and `Button` locale switcher preserving URL query parameters.
2. **Calm Theme-Matched Courtside Hero & Overlapped Search Dock (`HeroSection`, `HeroStage`, `SearchPanel`, `CategoryPills`)**: Continuous studio-tinted banner (`hero-courtside`) with subtle architectural court-line geometry, bold display headline, shadcn `Badge` (`goldSoft`) marketplace pill and crisp trust highlights, flowing without a vertical seam into the layered 2.5D stage (`HeroStage`). The elevated unified browse dock (`Card`) overlaps the hero's bottom edge (`-mt-6`) and pairs shadcn `Input`, `Label`, `NativeSelect` (`category`, `sort`), primary `Button`, `Separator`, and Swappa-inspired category tiles with domain icons and `aria-hidden` item counts so listing cards and EGP prices sit above the fold on desktop.
3. **Equipment Grid (`ListingCard`)**: Carousell-inspired P2P cards with crisp `1px` borders at rest and subtle hover lift in a balanced responsive grid (`3` columns on desktop/tablet `md:`, `2` on mobile `≥360px`, `1` on ultra-narrow `320px`) displaying a `4:3` recessed photo frame with pinned shadcn `Badge` condition pills (`gold` for New, `frosted` for Used), bold `Outfit` EGP price + `"For sale"` badge, model title stretched-link, Cairo location + brand metadata, and shadcn `Separator` + `Avatar` seller footer.
4. **Product-First Detail View (`EquipmentDetailView`) & Seller Storefront (`SellerProfileView`)**: Asymmetric desktop detail layout (`1.25fr` / `0.85fr`) built from shadcn `Card`, `Badge`, `Button`, `Avatar`, and `Separator` primitives pairing a `3:2` photo showcase and disclosures card with a sticky price, structured 2-column specification tiles, seller card, and direct-contact preview notice. Seller profiles feature a calm theme-matched courtside storefront banner followed by the 3-column listing grid.
5. **Theme-Matched Disclosure Showcase (`InspectionShowcase`)**: Calm shadcn `Card` + Radix-backed shadcn `Tabs` (`tablist`/`tabpanel` with roving tabindex & RTL `DirectionProvider` support) for **Carbon face & sweet spot**, **Frame & bumper guard**, and **Pressurized ball packs**.
6. **Editorial Value Proposition, 3-Step Workflow, FAQ & Calm Community Callout (`FeaturesSection`, `HowItWorksSection`, `FaqSection`, `CommunityCtaSection`, `SiteFooter`)**: Open asymmetric editorial split with hairline dividers (no nested card walls), 1–2–3 shadcn `Card` steps, 2-column Radix-backed shadcn `Accordion` FAQ with rotating Lucide `Plus` badges, calm shadcn `Card` + `Button` community callout, and structured multi-column footer.

## Brand and demo artwork provenance
- `public/brand/padelhub-mark.svg` and `src/app/icon.svg`: Custom code-native SVG mark (perforated white racket and yellow ball on a cobalt rounded square). Proposed identity, not a claim of trademark registration.
- `public/images/hero/padel-racket.webp`, `padel-ball-1.webp`, and `padel-ball-2.webp`: Generated unbranded 3D studio renders keyed to transparent WebP (89 KB combined) for the layered 2.5D hero stage (`HeroStage`). Decorative marketing imagery, not real inventory.
- `public/images/demo/racket-court.webp`, `racket-coral.webp`, and `balls.webp`: Generated unbranded editorial illustrations (1200px WebP). Detail captions explicitly note they are AI demo imagery, never evidence of condition or depictions of the named models.

## Required state behavior
- **Loading / Empty / Error**: Stable geometry, respect `prefers-reduced-motion`, explain why no listings match with a filter reset link, and retain entered inputs.
- **Moderation & Lifecycle (Stage 2–4 backlog)**: Draft/pending listings stay private; rejected listings retain images for correction; active listings require manual approval and public-contact consent; reserved/sold/traded states disable contact.
