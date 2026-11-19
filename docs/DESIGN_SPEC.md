# PadelHub — Design Specification

## Visual direction and semantic tokens
PadelHub uses **shadcn/ui** (`components.json`, New York style, Tailwind CSS v4, unified `radix-ui`) as its primary UI component pillar, themed with a minimalistic modern **Porcelain & Obsidian** base accented by **Court Emerald** and **Padel Volt** (`next-themes` with `attribute="data-theme"` and `defaultTheme="system"`, plus Radix `DirectionProvider` synced to locale `dir` for native Arabic RTL). Standard shadcn CSS variables are exposed through Tailwind v4 `@theme inline` and `@custom-variant dark` in `src/styles/tokens.css` (imported by `src/app/globals.css`), with backward-compatible legacy aliases (`--canvas`, `--surface`, `--text`, `--focus`, `--hero`) preserved:

- **Light theme (`:root`) — Porcelain & Obsidian Minimal + Court Emerald & Padel Volt**:
  - `--background`: `#f9fafb` (clean porcelain canvas)
  - `--foreground`: `#101317`
  - `--card` / `--popover`: `#ffffff` (`--card-foreground`: `#101317`)
  - `--primary`: `#101317` (`--primary-hover`: `#252b34`, `--primary-foreground`: `#ffffff` — minimalist obsidian primary actions)
  - `--secondary` / `--muted`: `#f2f4f7` (`--muted-foreground`: `#5f6673`)
  - `--accent`: `#e8f5f1` (`--accent-foreground`: `#0b6654`)
  - `--destructive`: `#c93b2b` (`--destructive-foreground`: `#ffffff`)
  - `--border` / `--input`: `#e6e8ec` (`--border-strong`: `#cfd4dc`)
  - `--ring`: `#0e7c66`
  - Brand & courtside extensions: `--brand`: `#0e7c66` (Court Emerald), `--court-gold`: `#d8f35b` (Padel Volt; `--court-gold-foreground`: `#172207`, `--gold-soft`: `#edf7cc`), `--header`: `rgba(249, 250, 251, 0.8)`
  - Elevation shadows: `--shadow-card`, `--shadow-card-hover`, `--shadow-dock`
- **Dark theme (`[data-theme="dark"]`) — Deep Obsidian Minimal + Court Emerald & Padel Volt**:
  - `--background`: `#0b0d10` (deep obsidian canvas)
  - `--foreground`: `#f3f5f8`
  - `--card` / `--popover`: `#13161b` (`--card-foreground`: `#f3f5f8`)
  - `--primary`: `#f3f5f8` (`--primary-hover`: `#dde3ec`, `--primary-foreground`: `#0b0d10` — minimalist high-contrast porcelain actions on obsidian)
  - `--secondary` / `--muted`: `#1a1e25` (`--muted-foreground`: `#8f98a6`)
  - `--accent`: `#122622` (`--accent-foreground`: `#46d9b2`)
  - `--destructive`: `#e05245` (`--destructive-foreground`: `#ffffff`)
  - `--border` / `--input`: `#20252e` (`--border-strong`: `#313845`)
  - `--ring`: `#46d9b2`
  - Brand & courtside extensions: `--brand`: `#46d9b2` (luminous emerald for links/icons on obsidian), `--court-gold`: `#c9e64c` (`--court-gold-foreground`: `#141c06`, `--gold-soft`: `rgba(201, 230, 76, 0.14)`), `--header`: `rgba(11, 13, 16, 0.78)`

## Typography and spacing
Self-hosted variable fonts loaded via `next/font/google` in `src/app/[locale]/layout.tsx` (zero runtime requests to Google):
- **Display & Pricing (`--font-display`)**: `Outfit` in English LTR; `Cairo` in Arabic RTL (`[dir="rtl"]`).
- **Body & UI Controls (`--font-sans`)**: `Plus Jakarta Sans` in English LTR; `Cairo` in Arabic RTL (`[dir="rtl"]`), with system sans fallbacks.
- Body 16px, line height 1.6; secondary text at least 11–12px. Headings use sentence case, fluid `clamp()` sizing, tight tracking in LTR, and zero letter-spacing with `1.3`–`1.38` line height in Arabic RTL. Primary interactive targets are at least 40–44px. Desktop content sits within a 1200px container.

## Responsive marketing and marketplace layout
1. **Sticky Marketplace App Bar (`SiteHeader`, `Brand`, `HeaderNav`, `Preferences`)**: Translucent frosted sticky header (`backdrop-blur-xl`, soft `border-border/50`) with the custom Court Emerald + Padel Volt perforated-racket SVG mark and `Outfit` wordmark, route-aware shadcn `Button` navigation (`HeaderNav`), shadcn `NativeSelect` theme combobox with live theme icons, and `Button` locale switcher preserving URL query parameters.
2. **Full-Bleed Seamlessly Blended 3D Hero & Translucent Browse Dock (`HeroSection`, `HeroStage`, `SearchPanel`, `CategoryPills`)**: Full-bleed borderless atmospheric header (`.hero-blend`) with radial Court Emerald and Padel Volt studio lighting and masked architectural court lines that dissolve seamlessly (`transparent → var(--background)`) into the page canvas below—no boxed border seam. Pairs crisp minimalist typography and shadcn `Badge` (`goldSoft`) with the non-clipping 3D stage (`HeroStage`) featuring a true 3D perspective camera rig (`.hero-rig`, `perspective: 1100px`, smooth `rotateX`/`rotateY` pointer tilt), reverse-depth `.hero-aura` and directional `.hero-keylight` glows (zero CSS blur filters), synchronized breathing floor shadows beneath the racket and foreground ball, compositor-only `transform`/`opacity` organic hover motion across 4 depth planes, and `IntersectionObserver` offscreen auto-pause (`data-paused="true"`). The translucent frosted Search Dock (`Card`, `bg-card/90 backdrop-blur-xl`) sits cleanly across the lower fade with shadcn `Input`, `Label`, `NativeSelect` (`category`, `sort`), primary `Button`, `Separator`, and rounded-full minimalist category pills (`CategoryPills`) with emerald icons and `aria-hidden` counts.
3. **Equipment Grid (`ListingCard`)**: Minimalist Carousell-inspired P2P cards (`rounded-[16px]`, crisp `1px` borders at rest, subtle hover lift) in a balanced responsive grid (`3` columns on desktop/tablet `md:`, `2` on mobile `≥360px`, `1` on ultra-narrow `320px`) displaying a `4:3` recessed photo frame with pinned rounded-full shadcn `Badge` condition pills (`gold` for New, `frosted` for Used), bold `Outfit` EGP price + `"For sale"` badge, model title stretched-link, Cairo location + brand metadata, and shadcn `Separator` + `Avatar` seller footer.
4. **Product-First Detail View (`EquipmentDetailView`) & Seller Storefront (`SellerProfileView`)**: Asymmetric desktop detail layout (`1.25fr` / `0.85fr`) built from shadcn `Card`, `Badge`, `Button`, `Avatar`, and `Separator` primitives pairing a `3:2` photo showcase and disclosures card with a sticky price, structured 2-column specification tiles, seller card, and direct-contact preview notice. Seller profiles feature a minimalist `.storefront-banner` emerald-tinted card followed by the 3-column listing grid.
5. **Theme-Matched Disclosure Showcase (`InspectionShowcase`)**: Calm shadcn `Card` + Radix-backed shadcn `Tabs` (`tablist`/`tabpanel` with roving tabindex & RTL `DirectionProvider` support) for **Carbon face & sweet spot**, **Frame & bumper guard**, and **Pressurized ball packs**.
6. **Editorial Value Proposition, 3-Step Workflow, FAQ & Calm Community Callout (`FeaturesSection`, `HowItWorksSection`, `FaqSection`, `CommunityCtaSection`, `SiteFooter`)**: Open asymmetric editorial split with hairline dividers (no nested card walls), 1–2–3 shadcn `Card` steps, 2-column Radix-backed shadcn `Accordion` FAQ with rotating Lucide `Plus` badges, calm shadcn `Card` + `Button` community callout, and structured multi-column footer.

## Brand and demo artwork provenance
- `public/brand/padelhub-mark.svg` and `src/app/icon.svg`: Custom code-native SVG mark (perforated white racket and Padel Volt `#D8F35B` ball on a Court Emerald `#0E7C66` rounded square). Proposed identity, not a claim of trademark registration.
- `public/images/hero/padel-racket-carbon.webp`, `padel-ball-far.webp`, `padel-ball-mid.webp`, and `padel-ball-near.webp`: Generated unbranded photorealistic studio product renders (matte 12K woven carbon racket with emerald/volt throat trim and 3 distinct fuzzy felt padel balls) chroma-keyed and color-decontaminated to transparent WebP (**75.2 KB combined**) for the 3D hero stage (`HeroStage`). Decorative marketing imagery, not real inventory.
- `public/images/demo/racket-court.webp`, `racket-coral.webp`, and `balls.webp`: Generated unbranded editorial illustrations (1200px WebP). Detail captions explicitly note they are AI demo imagery, never evidence of condition or depictions of the named models.

## Required state behavior
- **Loading / Empty / Error**: Stable geometry, respect `prefers-reduced-motion`, explain why no listings match with a filter reset link, and retain entered inputs.
- **Moderation & Lifecycle (Stage 2–4 backlog)**: Draft/pending listings stay private; rejected listings retain images for correction; active listings require manual approval and public-contact consent; reserved/sold/traded states disable contact.
