# PadelHub — Design Specification

## Visual direction and semantic tokens
PadelHub uses a calm, professional **Club Blue & Warm Stone** (Light) and **Club Blue & Neutral Graphite** (Dark) palette (`next-themes` with `attribute="data-theme"` and `defaultTheme="system"`), exposed through Tailwind v4 `@theme inline` and `@custom-variant dark` tokens in `src/styles/tokens.css` (imported by `src/app/globals.css`). Surfaces stay **calm and theme-matched** across every band—airy warm alabaster and crisp studio blues in Light mode, deep layered graphite in Dark mode—avoiding harsh full-width contrast whiplash:

- **Light theme (`:root`) — Club Blue & Warm Stone**:
  - `--canvas` (`--color-base`): `#f7f7f5` (warm alabaster page canvas)
  - `--surface` (`--color-surface`): `#ffffff` (crisp elevated card & control surface)
  - `--surface-subtle` (`--color-surface-subtle`): `#f1f2ee` (recessed warm-stone input & image wells)
  - `--surface-soft` (`--color-surface-soft`): `#eaf0fb` (soft court-blue tint for active states & icon wells)
  - `--text` (`--color-ink`): `#161e2e`
  - `--muted` (`--color-muted`): `#5a6577`
  - `--border` (`--color-line`): `#e3e5e9` (`--border-strong` / `--color-line-strong`: `#cdd2dc`)
  - `--accent` (`--color-accent`): `#2553b8` (`--accent-text` / `--color-accent-ink`: `#ffffff`)
  - `--action` (`--color-action`): `#2553b8`, `--action-hover`: `#1e4499`, `--action-text`: `#ffffff`
  - `--hero`: `#f2d15b` (`--hero-ink`: `#2a2209`, `--gold-soft`: `#fbf4d8`) — restrained court-gold micro-accent
  - `--hero-stage`: `#e4ecf9`, `--hero-stage-deep`: `#d6e3f7`
  - `--focus` (`--color-coral`): `#d95b38`
  - Elevation shadows: `--shadow-card`, `--shadow-card-hover`, `--shadow-dock`
- **Dark theme (`[data-theme="dark"]`) — Club Blue & Neutral Graphite**:
  - `--canvas`: `#111317` (restful charcoal-graphite canvas)
  - `--surface`: `#181c23` (card & panel surface)
  - `--surface-subtle`: `#1f242e` (recessed input & media frame surface)
  - `--surface-soft`: `#1d283c` (subtle blue-tinted active surface)
  - `--text`: `#edf0f5`
  - `--muted`: `#98a3b6`
  - `--border`: `#282f3c` (`--border-strong`: `#394356`)
  - `--accent`: `#7da8ff` (high-legibility text/icon cobalt on dark surfaces, `--accent-text`: `#0e1524`)
  - `--action`: `#3465d8`, `--action-hover`: `#4173e6`, `--action-text`: `#ffffff` (WCAG AA solid action fills without pastel washout)
  - `--hero`: `#d9ba4e` (`--hero-ink`: `#1a1608`, `--gold-soft`: `rgba(217, 186, 78, 0.14)`)
  - `--hero-stage`: `#1a212e`, `--hero-stage-deep`: `#141923`
  - `--focus`: `#f08c6c`

## Typography and spacing
Self-hosted variable fonts loaded via `next/font/google` in `src/app/[locale]/layout.tsx` (zero runtime requests to Google):
- **Display & Pricing (`--font-display`)**: `Outfit` in English LTR; `Cairo` in Arabic RTL (`[dir="rtl"]`).
- **Body & UI Controls (`--font-sans`)**: `Plus Jakarta Sans` in English LTR; `Cairo` in Arabic RTL (`[dir="rtl"]`), with system sans fallbacks.
- Body 16px, line height 1.6; secondary text at least 11–12px. Headings use sentence case, fluid `clamp()` sizing, tight tracking in LTR, and zero letter-spacing with `1.3`–`1.38` line height in Arabic RTL. Primary interactive targets are at least 40–44px. Desktop content sits within a 1200px container.

## Responsive marketing and marketplace layout
1. **Sticky Marketplace App Bar (`SiteHeader`, `Brand`, `HeaderNav`, `Preferences`)**: Translucent sticky header (`backdrop-blur-md`) with the custom perforated-racket SVG mark + `Outfit` wordmark, route-aware pill navigation (`HeaderNav`), custom-styled native theme selector combobox with live theme icons, and pill locale switcher preserving URL query parameters.
2. **Calm Theme-Matched Courtside Hero & Overlapped Search Dock (`HeroSection`, `HeroStage`, `SearchPanel`, `CategoryPills`)**: Continuous studio-tinted banner (`hero-courtside`) with subtle architectural court-line geometry, bold display headline, soft court-gold marketplace badge and crisp trust highlights, flowing without a vertical seam into the layered 2.5D stage (`HeroStage`: floating 3D padel racket + 3 padel balls, CSS float motion, fine-pointer parallax, RTL mirroring, and `prefers-reduced-motion` support). The elevated unified browse dock overlaps the hero's bottom edge (`-mt-6`) and pairs inline URL search (`q`), custom-styled category (`category`) and sort (`sort`) selects, cobalt action submit button, and Swappa-inspired category tiles with domain icons and `aria-hidden` item counts so the listing cards and their EGP prices sit above the fold on desktop.
3. **Equipment Grid (`ListingCard`)**: Carousell-inspired P2P cards with crisp `1px` borders at rest and subtle hover lift in a balanced responsive grid (`3` columns on desktop/tablet `md:`, `2` on mobile `≥360px`, `1` on ultra-narrow `320px`) displaying a `4:3` recessed photo frame with pinned condition pill (`New` in muted court-gold, `Used` in crisp frosted surface), bold `Outfit` EGP price + `"For sale"` pill, model title stretched-link, Cairo location + brand metadata, and seller footer with directional chevron.
4. **Product-First Detail View (`EquipmentDetailView`) & Seller Storefront (`SellerProfileView`)**: Asymmetric desktop detail layout (`1.25fr` / `0.85fr`) pairing a `3:2` photo showcase and disclosures card with a sticky price, structured 2-column specification tiles, seller card, and direct-contact preview notice. Seller profiles feature a calm theme-matched courtside storefront banner followed by the 3-column listing grid.
5. **Theme-Matched Disclosure Showcase (`InspectionShowcase`)**: Calm theme-matched showcase band (`courtside-showcase`) with accessible `tablist`/`tabpanel` controls for **Carbon face & sweet spot**, **Frame & bumper guard**, and **Pressurized ball packs**, pairing subtle recessed inspection frames with clear active-tab accents.
6. **Editorial Value Proposition, 3-Step Workflow, FAQ & Calm Community Callout (`FeaturesSection`, `HowItWorksSection`, `FaqSection`, `CommunityCtaSection`, `SiteFooter`)**: Open asymmetric editorial split with hairline dividers (no nested card walls), 1–2–3 step cards with soft court-gold badges, 2-column native `<details>`/`<summary>` FAQ accordion with rotating Lucide `Plus` badges, calm theme-matched community callout card (eliminating full-width neon/yellow glare in dark mode), and structured multi-column footer.

## Brand and demo artwork provenance
- `public/brand/padelhub-mark.svg` and `src/app/icon.svg`: Custom code-native SVG mark (perforated white racket and yellow ball on a cobalt rounded square). Proposed identity, not a claim of trademark registration.
- `public/images/hero/padel-racket.webp`, `padel-ball-1.webp`, and `padel-ball-2.webp`: Generated unbranded 3D studio renders keyed to transparent WebP (89 KB combined) for the layered 2.5D hero stage (`HeroStage`). Decorative marketing imagery, not real inventory.
- `public/images/demo/racket-court.webp`, `racket-coral.webp`, and `balls.webp`: Generated unbranded editorial illustrations (1200px WebP). Detail captions explicitly note they are AI demo imagery, never evidence of condition or depictions of the named models.

## Required state behavior
- **Loading / Empty / Error**: Stable geometry, respect `prefers-reduced-motion`, explain why no listings match with a filter reset link, and retain entered inputs.
- **Moderation & Lifecycle (Stage 2–4 backlog)**: Draft/pending listings stay private; rejected listings retain images for correction; active listings require manual approval and public-contact consent; reserved/sold/traded states disable contact.
