# PadelHub — Design Specification

## Visual direction and semantic tokens (Phase UI-A — Modern Minimal Courtside Retail)
PadelHub uses a modern, minimal, sporty, calm, and trustworthy courtside retail identity in both Light and Dark themes (`next-themes` with `attribute="data-theme"` and `defaultTheme="system"`), exposed through Tailwind v4 `@theme inline` tokens in `src/app/globals.css`.

The rejected `v2` visual direction (3D/2.5D floating racket stage, StockX/GOAT glow effects, heavy `radix-ui`/`shadcn` widgets, and external Google Fonts) is retired and must not be reintroduced.

- **Light theme (`:root`)**:
  - `--canvas` (`--color-base`): `#f7f7f5` (warm alabaster off-white)
  - `--surface` (`--color-surface`): `#ffffff` (pure surface card/panel)
  - `--surface-soft` (`--color-surface-soft`): `#eef2ef` (soft courtside sage-tinted neutral)
  - `--text` (`--color-ink`): `#121816` (deep courtside charcoal)
  - `--muted` (`--color-muted`): `#525e58` (mineral slate secondary copy)
  - `--border` (`--color-line`): `#dfe3de` (1px hairline border; `--border-strong`: `#c8d0ca`)
  - `--accent` (`--color-accent`): `#14533c` (deep court turf green; `--accent-hover`: `#0e3d2c`, `--accent-soft`: `#e6efe9`, `--accent-text`: `#ffffff`)
  - `--focus` (`--color-coral`): `#c85a32` (warm terracotta-clay focus outline & brand period)
  - `--status-new-bg` / `--status-new-text`: `#e4f2eb` / `#114a35`
  - `--status-used-bg` / `--status-used-text`: `#f1efe9` / `#45433e`
  - `--status-warn-bg` / `--status-warn-text`: `#fbf2de` / `#6e480a`
  - `--status-danger-bg` / `--status-danger-text`: `#fbe9e7` / `#8b261d`
- **Dark theme (`[data-theme="dark"]`)**:
  - `--canvas`: `#0c100f` (deep obsidian court night)
  - `--surface`: `#131917` (elevated dark slate)
  - `--surface-soft`: `#1a2320`
  - `--text`: `#eef2f0` (crisp alabaster)
  - `--muted`: `#9aa7a0`
  - `--border`: `#25302c` (`--border-strong`: `#34443e`)
  - `--accent`: `#4ec99b` (luminous court emerald; `--accent-hover`: `#6ad5ad`, `--accent-soft`: `rgba(78, 201, 155, 0.14)`, `--accent-text`: `#081c14`)
  - `--focus`: `#f08c69`
  - `--status-new-bg` / `--status-new-text`: `rgba(78, 201, 155, 0.16)` / `#7ee0ba`
  - `--status-used-bg` / `--status-used-text`: `#1e2724` / `#c2ccc7`

## Typography and spacing
- **Font stack**: Zero-network local system sans-serif stack with Arabic-capable fallbacks (`ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Arial, sans-serif`).
- **Hierarchy & numeric clarity**: Body 16px, line height 1.6; secondary metadata 12px–14px. Headings use sentence case, fluid `clamp()` sizing, tight tracking (`-0.024em` to `-0.03em`) in LTR, and zero letter-spacing with `1.38`–`1.45` line height in Arabic RTL (`[dir="rtl"]`). No forced uppercase on Arabic copy.
- **Tabular figures**: All prices (`.price`), result counts (`.result-count`), active filter badges (`.filters-count-pill`), specification chips (`.card-spec-chip`), and step badges (`.step-number`) use `font-variant-numeric: tabular-nums`.
- **Container & geometry**: Desktop content sits within a `1240px` container (`--radius-sm: 8px`, `--radius-control: 10px`, `--radius-md: 12px`, `--radius-lg: 16px`).

## Responsive global shell and marketplace layout (Phase UI-A)
1. **Header (`SiteHeader`)**: Sticky blurred surface bar (`backdrop-filter: blur(12px)`) with custom deep-green perforated-racket & gold-ball SVG emblem (`public/brand/padelhub-mark.svg`), `padelhub.` wordmark (`Brand`), primary links (`Explore`, `How it works`, `My profile`), a desktop `"Sell equipment"` primary CTA (`/account/listings`), and `Preferences` (theme selector + `العربية` / `English` locale switcher preserving URL query parameters).
2. **Hero (`HeroSection`)**: Restrained 2D courtside retail banner (no 3D/WebGL) featuring a location pill badge, concise heading and intro, primary/secondary CTAs (`Browse equipment` → `#equipment-heading` and `List your gear` → `/account/listings`), 3 scannable trust highlights (`0% platform commission`, `Mandatory frame & face disclosures`, `Direct WhatsApp coordination`), and framed 2D equipment artwork.
3. **Marketplace Command Bar (`SearchPanel`, `CategoryPills`)**: Bordered search input with focus-within ring, primary submit CTA (`Find equipment`), collapsible `<details className="filters">` drawer with active filter count badge (`.filters-count-pill`), and category shortcut pills (`All equipment`, `Rackets`, `Balls`, `Padel shoes`, `Bags`) with category-specific icons.
4. **Unified Product Cards (`ListingCard`, `PublicCard`)**: Three-column desktop grid (two on tablet, one on mobile) with a `4:3` image container, semantic `New`/`Used` condition badge (`.condition.is-new` / `.condition.is-used`), category tag (`.card-meta-tag`), schema-supported category spec chip (`.card-spec-chip` for shoe `EU {size}` or racket `{weight} g`), offer type tag (`.card-offer-tag`), title link, bold tabular-nums EGP price (`.price`) with optional `Negotiable` pill (`.card-negotiable-tag`), and a hairline-separated footer (`.card-footer`) with governorate location and seller link + avatar initial.
5. **Interactive Disclosure Showcase (`InspectionShowcase`)**: Accessible `tablist`/`tabpanel` switcher allowing players to inspect mandatory disclosure criteria for **Carbon face & sweet spot**, **Frame & bumper guard**, and **Pressurized ball packs**.
6. **Editorial Value Proposition, 3-Step Workflow, FAQ & Footer (`FeaturesSection`, `HowItWorksSection`, `FaqSection`, `CommunityCtaSection`, `SiteFooter`)**: Explains manual moderation, direct WhatsApp coordination, club-ready QR profiles, the 1–2–3 handover flow, native `<details>`/`<summary>` FAQ accordions, and a structured retail footer with trust summary pill and navigation links.

## Brand and demo artwork provenance
- `public/brand/padelhub-mark.svg` and `src/app/icon.svg`: Custom code-native SVG mark (perforated white racket and warm court-gold `#E8C547` ball on a deep court-green `#14533C` rounded square). Proposed identity, not a claim of trademark registration.
- `public/images/demo/racket-court.webp`, `racket-coral.webp`, and `balls.webp`: Generated unbranded editorial illustrations (1200px WebP). Cards and detail pages explicitly label them as AI demo imagery, never evidence of condition or depictions of the named models.

## Required state behavior
- **Loading / Empty / Error**: Stable geometry, respect `prefers-reduced-motion`, explain why no listings match with a filter reset link, and retain entered inputs.
- **Moderation & Lifecycle**: Draft/pending listings stay private; rejected listings retain images for correction; active listings require manual approval and public-contact consent; sold/traded states disable contact.

## Account surfaces — 2026-11-17
Focused native signup/signin forms and a profile page inherit the marketplace's semantic themes. Usernames are chosen once at profile creation and then displayed read-only. Profile details and WhatsApp consent have separate saves; privacy and contact are opt-in and visually distinct. EN/AR labels, logical spacing, responsive controls and status feedback are included. Personal/Business are account types, with one account able to buy and sell.

Public profiles use the existing marketplace cards, semantic themes and RTL layout, with a locale-neutral Copy profile link action. Empty profiles remain usable; QR show/hide and PNG download use an unstyled black-on-white code with a four-module quiet zone in both themes.
