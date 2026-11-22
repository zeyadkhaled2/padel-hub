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
- **Container, Soft Minimal / Premium Rounded geometry & sticky-header offset**:
  - Desktop content sits within a `1240px` container.
  - Semantic radius hierarchy (inspired by modern iOS interfaces, with proportional nested radii):
    - `--radius-sm: 8px` — Small labels, condition/category/spec chips, and compact controls.
    - `--radius-control: 12px` — Standard buttons (`.button`), search input wrapper, filter selects/inputs, header navigation links, theme selector, language toggle, and step/feature icon badges.
    - `--radius-card: 18px` — Product cards (`.listing-card`), step cards (`.step-card`), FAQ cards (`.faq-item`), and nested media stages inside `24px` containers (`.hero-equipment`, `.inspection-stage`).
    - `--radius-panel: 20px` (`--radius-md: 20px`) — Larger content cards and panels (`.search-panel`, `.features-list`, `.community-banner`, `.empty-state`, `.disclosure`, and mobile hero/inspection containers).
    - `--radius-lg: 24px` — Homepage hero (`.hero`), interactive inspection showcase (`.inspection-section`), and major containers.
    - `--radius-pill: 999px` — Category shortcut pills (`.category-link`) and small capsule badges (`.hero-badge`, `.result-count`, `.filters-count-pill`, `.card-negotiable-tag`).
  - Sticky-header anchor offset: `--sticky-header-offset: 92px` on desktop/tablet (`> 700px`) and `128px` on mobile (`<= 700px`, accounting for the 2-row mobile sticky header), applied via `scroll-margin-top` scoped exclusively to intended page/section anchors (`#equipment-heading`, `#main-content`, `#pending-queue`, `#inspection-heading`, `#features-heading`, `#how-it-works-heading`, `#faq-heading`) without duplicating `scroll-padding-top` on `html`.

## Responsive global shell and marketplace layout (Phase UI-A)
1. **Header (`SiteHeader`)**: Sticky blurred surface bar (`backdrop-filter: blur(12px)`) with the official Canva-derived H-monogram + lowercase `padelhub.` horizontal SVG logo (`Brand`, theme-aware `--accent` & `--brand-ink`, locked LTR visual order in both EN and AR), primary links (`Explore`, `How it works`, `My profile`), a desktop `"Sell equipment"` primary CTA (`/account/listings`), and `Preferences` (theme selector + `العربية` / `English` locale switcher preserving URL query parameters).
2. **Hero (`HeroSection`)**: Restrained 2D courtside retail banner (no 3D/WebGL) featuring a location pill badge, concise heading and intro, primary/secondary CTAs (`Browse equipment` → `#equipment-heading` and `List your gear` → `/account/listings`), 3 scannable trust highlights (`0% platform commission`, `Mandatory frame & face disclosures`, `Direct WhatsApp coordination`), and framed 2D equipment artwork.
3. **Marketplace Command Bar (`SearchPanel`, `CategoryPills`)**: Bordered search input with focus-within ring, primary submit CTA (`Find equipment`), collapsible `<details className="filters">` drawer with active filter count badge (`.filters-count-pill`), and category shortcut pills (`All equipment`, `Rackets`, `Balls`, `Padel shoes`, `Bags`) with category-specific icons.
4. **Unified Product Cards (`ListingCard`, `PublicCard`)**: Three-column desktop grid (two on tablet, one on mobile) with a `4:3` image container, semantic `New`/`Used` condition badge (`.condition.is-new` / `.condition.is-used`), category tag (`.card-meta-tag`), schema-supported category spec chip (`.card-spec-chip` for shoe `EU {size}` or racket `{weight} g`), offer type tag (`.card-offer-tag`), title link, bold tabular-nums EGP price (`.price`) with optional `Negotiable` pill (`.card-negotiable-tag`), and a hairline-separated footer (`.card-footer`) with governorate location and seller link + avatar initial.
5. **Interactive Disclosure Showcase (`InspectionShowcase`)**: Accessible `tablist`/`tabpanel` switcher allowing players to inspect mandatory disclosure criteria for **Carbon face & sweet spot**, **Frame & bumper guard**, and **Pressurized ball packs**.
6. **Editorial Value Proposition, 3-Step Workflow, FAQ & Footer (`FeaturesSection`, `HowItWorksSection`, `FaqSection`, `CommunityCtaSection`, `SiteFooter`)**: Explains manual moderation, direct WhatsApp coordination, club-ready QR profiles, the 1–2–3 handover flow, native `<details>`/`<summary>` FAQ accordions, and a structured retail footer with trust summary pill and navigation links.

## Brand and demo artwork provenance
- **Official Canva Logo Reference**: Canva design `DAHbmvTuNN8` (`padelhub. — H Monogram Logo (Premium Rounded Variant)`), matched faithfully with the softly rounded deep court green (`#14533C`) **H** monogram and clean geometric lowercase **`padelhub.`** wordmark (`#111617`), without a gold ball per owner confirmation.
  - `public/brand/padelhub-logo.svg`: Full horizontal SVG logo (`viewBox="0 0 172 39"`, Light `#14533C` + `#111617`, transparent background).
  - `public/brand/padelhub-logo-dark.svg`: Full horizontal dark-theme adaptation (`viewBox="0 0 172 39"`, Dark `#4EC99B` + `#EEF2F0`, transparent background).
  - `public/brand/padelhub-mark.svg`: Standalone rounded H monogram icon (`viewBox="0 0 64 64"`, `#14533C`, transparent background).
  - `src/app/icon.svg`: Simplified, high-contrast browser favicon (`viewBox="0 0 32 32"`, white rounded H centered on a `#14533C` `rx="8"` badge for crisp legibility at `16px` and `32px` on both light and dark browser tabs).
  - `src/components/layout/brand.tsx`: Inline theme-aware SVG component rendering the exact `DAHbmvTuNN8` horizontal H-monogram + `padelhub.` geometry with zero double wordmarks and locked LTR visual order across English and Arabic.
- `public/images/demo/racket-court.webp`, `racket-coral.webp`, and `balls.webp`: Generated unbranded editorial illustrations (1200px WebP). Cards and detail pages explicitly label them as AI demo imagery, never evidence of condition or depictions of the named models.

## Required state behavior
- **Loading / Empty / Error**: Stable geometry, respect `prefers-reduced-motion`, explain why no listings match with a filter reset link, and retain entered inputs.
- **Moderation & Lifecycle**: Draft/pending listings stay private; rejected listings retain images for correction; active listings require manual approval and public-contact consent; sold/traded states disable contact.

## Account surfaces — 2026-11-17
Focused native signup/signin forms and a profile page inherit the marketplace's semantic themes. Usernames are chosen once at profile creation and then displayed read-only. Profile details and WhatsApp consent have separate saves; privacy and contact are opt-in and visually distinct. EN/AR labels, logical spacing, responsive controls and status feedback are included. Personal/Business are account types, with one account able to buy and sell.

Public profiles use the existing marketplace cards, semantic themes and RTL layout, with a locale-neutral Copy profile link action. Empty profiles remain usable; QR show/hide and PNG download use an unstyled black-on-white code with a four-module quiet zone in both themes.

## Buyer experience surfaces (Phase UI-B)
1. **Product Details (`PublicDetail` & `EquipmentDetailView`)**: Balanced two-column desktop hero (`1.15fr` media / `0.85fr` summary) collapsing to a mobile-first single column (gallery first, title/price/CTA immediately discoverable).
   - **Interactive Product Gallery (`ProductGallery`)**: Zero-dependency keyboard- and touch-accessible photo viewer built on the existing authorization-checked `/api/media/[mediaId]?listing=...&variant=full|thumb` proxy. Uses `4:3` `object-fit: contain` staging (preventing cropped racket frames), `dir="ltr"` tabular photo counter (`1 / N`), RTL-mirrored `44px` Prev/Next buttons, `ArrowLeft`/`ArrowRight`/`Home`/`End` keyboard support, horizontal thumbnail strip (`variant=thumb`), and a localized error fallback with retry.
   - **Disclosures & Specifications**: Prominent **Condition & inspection disclosures** panel highlighting racket structural damage/repair notes in a high-contrast semantic callout (`--status-warn-bg` / `--status-warn-text`), dedicated swap preferences card for swap/both rackets, responsive schema-backed specifications grid (showing only real non-null fields: Brand, Model, Category, Condition, Offer type, Location, shoe `EU` size, ball packaging/availability note, and optional racket year/weight/shape), and readable description prose.
   - **Contact CTA, Lifecycle States & Mobile Sticky Bar (`MobileContactBar`)**: Preserves the server-controlled `/api/contact/[id]?locale=...` WhatsApp redirect on `active` listings. Sold/traded/reserved states display an unmistakable semantic banner and remove WhatsApp links. On mobile (`<= 768px`), an `IntersectionObserver`-backed sticky contact bar appears only after the primary CTA scrolls out of view (preventing duplicate visible CTAs and preserving footer clearance).
   - **Seller Card & Trust Guidance**: Clickable seller summary linking to `/@username` (or `/demo/sellers/omar_padel` in demo) with initials avatar and honest Personal/Business account labeling (never implying verification), paired with a concise 3-point meetup/inspection checklist and manual-review disclaimer.
2. **Public Seller Storefront (`PublicProfilePage`, `ShareProfile` & `SellerProfileView`)**: Full `1240px` storefront container (`.storefront-page`) with a `24px`-rounded seller hero banner (avatar initial, `@username`, Personal/Business pill with explicit non-verification notice for Business accounts, location, optional favorite racket, bio, and sharing/report actions), followed by the UI-A three-column `.listing-grid` of `<PublicCard>` items (or a polished empty state with browse-all CTA) and accessible pagination.
   - **Sharing & QR (`ShareProfile`)**: Copy profile link button with accessible `role="status"` feedback and manual fallback input, plus a Show/Hide QR panel rendering the lazy-loaded black-on-white QR PNG (`margin: 4`) inside a pure `#ffffff` quiet-zone frame in both light and dark themes, paired with `@username`, scan hint, and PNG download (`padelhub-{username}-qr.png`).
3. **Buyer Reporting (`ReportForm`)**: Non-intrusive trigger button opening a native HTML `<dialog>` (`showModal()`) with translucent backdrop scrim, initial focus management, Escape/backdrop dismissal with focus restoration to the trigger button, inert background while open, controlled input retention across validation/auth errors, live character counter (`0 / 1,000`), privacy notice, and localized success/error states. Admin `ResolveForm` remains untouched.
