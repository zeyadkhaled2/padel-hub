# PadelHub — Design Specification

## Visual direction and semantic tokens
PadelHub uses a friendly, high-craft **Courtside Precision** identity in both Light and Dark themes (`next-themes` with `attribute="data-theme"` and `defaultTheme="system"`), exposed through Tailwind v4 `@theme inline` and `@custom-variant dark` tokens in `src/styles/tokens.css` (imported by `src/app/globals.css`):

- **Light theme (`:root`)**:
  - `--canvas` (`--color-base`): `#f3f5fa`
  - `--surface` (`--color-surface`): `#ffffff`
  - `--surface-soft` (`--color-surface-soft`): `#e9effd`
  - `--text` (`--color-ink`): `#111c33`
  - `--muted` (`--color-muted`): `#52607a`
  - `--border` (`--color-line`): `#dce3ef`
  - `--accent` (`--color-accent`): `#244bd8` (`--accent-text` / `--color-accent-ink`: `#ffffff`)
  - `--hero`: `#f6d957` (`--hero-ink`: `#111c33`, `--hero-stage`: `#132550`, `--hero-stage-deep`: `#0b1633`)
  - `--focus` (`--color-coral`): `#e96640`
  - Elevation shadows: `--shadow-card`, `--shadow-card-hover`, `--shadow-dock`
- **Dark theme (`[data-theme="dark"]`)**:
  - `--canvas`: `#0b1220`
  - `--surface`: `#131e33`
  - `--surface-soft`: `#1d2c49`
  - `--text`: `#f3f6fc`
  - `--muted`: `#aebcd4`
  - `--border`: `#263653`
  - `--accent`: `#9cb5ff` (`--accent-text` / `--color-accent-ink`: `#0d1838`)
  - `--hero`: `#eacb51` (`--hero-ink`: `#111c33`, `--hero-stage`: `#152754`, `--hero-stage-deep`: `#0b1530`)
  - `--focus`: `#ff9e7e`

## Typography and spacing
Self-hosted variable fonts loaded via `next/font/google` in `src/app/[locale]/layout.tsx` (zero runtime requests to Google):
- **Display & Pricing (`--font-display`)**: `Outfit` in English LTR; `Cairo` in Arabic RTL (`[dir="rtl"]`).
- **Body & UI Controls (`--font-sans`)**: `Plus Jakarta Sans` in English LTR; `Cairo` in Arabic RTL (`[dir="rtl"]`), with system sans fallbacks.
- Body 16px, line height 1.6; secondary text at least 11–12px. Headings use sentence case, fluid `clamp()` sizing, tight tracking in LTR, and zero letter-spacing with `1.38` line height in Arabic RTL. Primary interactive targets are at least 40–44px. Desktop content sits within a 1200px container.

## Responsive marketing and marketplace layout
1. **Sticky Marketplace App Bar (`SiteHeader`, `Brand`, `HeaderNav`, `Preferences`)**: Translucent sticky header (`backdrop-blur-md`) with the custom perforated-racket SVG mark + `Outfit` wordmark, route-aware pill navigation (`HeaderNav`), custom-styled native theme selector combobox with live theme icons, and pill locale switcher preserving URL query parameters.
2. **Seamless Panoramic Courtside Hero & Overlapped Search Dock (`HeroSection`, `HeroStage`, `SearchPanel`, `CategoryPills`)**: Continuous deep-navy courtside banner (`hero-courtside`) with architectural court-line geometry, bold white display headline, padel-yellow marketplace badge and translucent trust chips, flowing without a vertical seam into the layered 2.5D stage (`HeroStage`: floating 3D padel racket + 3 padel balls, CSS float motion, fine-pointer parallax, RTL mirroring, and `prefers-reduced-motion` support). The elevated unified browse dock overlaps the hero's bottom edge (`-mt-6`) and pairs inline URL search (`q`), custom-styled category (`category`) and sort (`sort`) selects, submit action, and Swappa-inspired category tiles with domain icons and `aria-hidden` item counts so the listing cards and their EGP prices sit above the fold on desktop.
3. **Equipment Grid (`ListingCard`)**: Carousell-inspired elevated P2P cards in a balanced responsive grid (`3` columns on desktop/tablet `md:`, `2` on mobile `≥360px`, `1` on ultra-narrow `320px`) displaying a `4:3` photo frame with pinned condition pill (`New` in padel-yellow, `Used` in frosted dark slate), bold `Outfit` EGP price + `"For sale"` pill, model title stretched-link, Cairo location + brand metadata, and seller footer with directional chevron.
4. **Product-First Detail View (`EquipmentDetailView`) & Seller Storefront (`SellerProfileView`)**: Asymmetric desktop detail layout (`1.25fr` / `0.85fr`) pairing a `3:2` photo showcase and disclosures card with a sticky price, metadata chips, seller card, and direct-contact preview notice. Seller profiles feature a deep-navy courtside storefront banner followed by the 3-column listing grid.
5. **Dark Courtside Disclosure Showcase (`InspectionShowcase`)**: High-contrast deep-navy showcase band (`courtside-showcase`) with accessible `tablist`/`tabpanel` controls for **Carbon face & sweet spot**, **Frame & bumper guard**, and **Pressurized ball packs**.
6. **Editorial Value Proposition, 3-Step Workflow, FAQ & Courtside Callout (`FeaturesSection`, `HowItWorksSection`, `FaqSection`, `CommunityCtaSection`, `SiteFooter`)**: Open asymmetric editorial split with hairline dividers (no nested card walls), 1–2–3 courtside step cards, 2-column native `<details>`/`<summary>` FAQ accordion with rotating Lucide `Plus` badges, padel-yellow community callout banner, and structured multi-column footer.

## Brand and demo artwork provenance
- `public/brand/padelhub-mark.svg` and `src/app/icon.svg`: Custom code-native SVG mark (perforated white racket and yellow ball on a cobalt rounded square). Proposed identity, not a claim of trademark registration.
- `public/images/hero/padel-racket.webp`, `padel-ball-1.webp`, and `padel-ball-2.webp`: Generated unbranded 3D studio renders keyed to transparent WebP (89 KB combined) for the layered 2.5D hero stage (`HeroStage`). Decorative marketing imagery, not real inventory.
- `public/images/demo/racket-court.webp`, `racket-coral.webp`, and `balls.webp`: Generated unbranded editorial illustrations (1200px WebP). Detail captions explicitly note they are AI demo imagery, never evidence of condition or depictions of the named models.

## Required state behavior
- **Loading / Empty / Error**: Stable geometry, respect `prefers-reduced-motion`, explain why no listings match with a filter reset link, and retain entered inputs.
- **Moderation & Lifecycle (Stage 2–4 backlog)**: Draft/pending listings stay private; rejected listings retain images for correction; active listings require manual approval and public-contact consent; reserved/sold/traded states disable contact.
