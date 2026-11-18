# PadelHub — Design Specification

## Visual direction and semantic tokens
PadelHub uses a friendly, courtside sport identity in both Light and Dark themes (`next-themes` with `attribute="data-theme"` and `defaultTheme="system"`), exposed through Tailwind v4 `@theme inline` tokens in `src/styles/tokens.css` (imported by `src/app/globals.css`):

- **Light theme (`:root`)**:
  - `--canvas` (`--color-base`): `#f5f6fa`
  - `--surface` (`--color-surface`): `#ffffff`
  - `--surface-soft` (`--color-surface-soft`): `#eaf0ff`
  - `--text` (`--color-ink`): `#17243e`
  - `--muted` (`--color-muted`): `#556278`
  - `--border` (`--color-line`): `#dce2ec`
  - `--accent` (`--color-accent`): `#244bd8`
  - `--hero`: `#f6d957` (`--hero-ink`: `#17243e`, `--hero-stage`: `#122144`)
  - `--focus` (`--color-coral`): `#e96640`
- **Dark theme (`[data-theme="dark"]`)**:
  - `--canvas`: `#0e1525`
  - `--surface`: `#172237`
  - `--surface-soft`: `#22314e`
  - `--text`: `#f3f5fc`
  - `--muted`: `#b1bfd6`
  - `--border`: `#2f3e59`
  - `--accent`: `#a7bcff` (`--accent-text`: `#101b3d`)
  - `--hero`: `#eacb51` (`--hero-ink`: `#17243e`, `--hero-stage`: `#15254b`)
  - `--focus`: `#ff9e7e`

## Typography and spacing
Use a zero-network local system sans-serif stack with Arabic-capable fallbacks (`ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Arial, sans-serif`). Body 16px, line height 1.6; secondary text at least 12px. Headings use sentence case, fluid `clamp()` sizing, tight tracking in LTR, and zero letter-spacing with `1.45` line height in Arabic RTL (`[dir="rtl"]`). Primary interactive targets are at least 44px. Desktop content sits within a 1200px container.

## Responsive marketing and marketplace layout
1. **Header (`SiteHeader`)**: Custom perforated-racket and ball SVG symbol (`public/brand/padelhub-mark.svg`) paired with the live `padelhub.` wordmark (`Brand`), route navigation, and `Preferences` (theme selector + locale switcher preserving URL query parameters).
2. **Hero & Search (`HeroSection`, `HeroStage`, `SearchPanel`, `CategoryPills`)**: Split courtside hero pairing the warm yellow copy block (`0% platform commission`, `Mandatory frame & face disclosures`, `Direct WhatsApp coordination`) with a deep courtside navy 2.5D stage (`HeroStage`: layered floating padel racket + 3 padel balls at near/mid/far depth with subtle court lines, CSS float motion, fine-pointer parallax, RTL mirroring, and `prefers-reduced-motion` support), immediately followed by full-width URL search, expandable filters, and category pills so the primary search submit action remains inside the initial 900px mobile and desktop viewport.
3. **Equipment Grid (`ListingCard`)**: Three-column desktop grid (two on tablet, one on mobile) displaying condition badge, title link, EGP price, Cairo location, and seller link.
4. **Interactive Disclosure Showcase (`InspectionShowcase`)**: Accessible `tablist`/`tabpanel` switcher allowing players to inspect mandatory disclosure criteria for **Carbon face & sweet spot**, **Frame & bumper guard**, and **Pressurized ball packs**.
5. **Editorial Value Proposition, 3-Step Workflow & FAQ (`FeaturesSection`, `HowItWorksSection`, `FaqSection`, `CommunityCtaSection`)**: Explains manual moderation, direct WhatsApp coordination, club-ready QR profiles, the 1–2–3 handover flow, and common buyer/seller questions using native `<details>`/`<summary>` accordions.

## Brand and demo artwork provenance
- `public/brand/padelhub-mark.svg` and `src/app/icon.svg`: Custom code-native SVG mark (perforated white racket and yellow ball on a cobalt rounded square). Proposed identity, not a claim of trademark registration.
- `public/images/hero/padel-racket.webp`, `padel-ball-1.webp`, and `padel-ball-2.webp`: Generated unbranded 3D studio renders keyed to transparent WebP (89 KB combined) for the layered 2.5D hero stage (`HeroStage`). Decorative marketing imagery, not real inventory.
- `public/images/demo/racket-court.webp`, `racket-coral.webp`, and `balls.webp`: Generated unbranded editorial illustrations (1200px WebP). Detail captions explicitly note they are AI demo imagery, never evidence of condition or depictions of the named models.

## Required state behavior
- **Loading / Empty / Error**: Stable geometry, respect `prefers-reduced-motion`, explain why no listings match with a filter reset link, and retain entered inputs.
- **Moderation & Lifecycle (Stage 2–4 backlog)**: Draft/pending listings stay private; rejected listings retain images for correction; active listings require manual approval and public-contact consent; reserved/sold/traded states disable contact.
