# PadelHub v2 — High-End Marketing & Marketplace Experience Plan

Date: 2026-11-14
Branch: `v2`

## 1. Grounding the brief
- **Product:** PadelHub is an Egypt-first, bilingual (English / Arabic RTL) padel equipment marketplace connecting players and businesses to buy, sell, and swap rackets and balls directly over WhatsApp with zero checkout commissions.
- **Audience:** Egyptian padel players (weekend players to club regulars across Cairo, New Cairo, Sheikh Zayed, Alexandria) and local equipment sellers looking for transparent condition disclosures and direct WhatsApp coordination.
- **Primary action:** Discover and compare equipment right away (with search and category filters above the fold), inspect transparent condition disclosures and seller profiles, and understand the 3-step direct-WhatsApp workflow.
- **Scope & truthfulness constraints:** All current inventory and seller profiles are explicitly labeled demo fixtures (`noindex`). No fake metrics, fake testimonials, checkout flows, or unimplemented backend endpoints are claimed as live.

## 2. Compact design plan (Calm Next.js Design + Premium Marketing Site architecture)

### Color tokens (`@theme` semantic system, Light & Dark)
Never pure `#000` on `#fff`. Soft court-inspired surfaces paired with high-contrast navy ink, cobalt court accent, warm padel-ball yellow highlight, and clay-coral focus/accents:
- **Light mode:**
  - `--color-base`: `#f5f6fa` (soft courtside daylight)
  - `--color-surface`: `#ffffff` (elevated card/panel surface)
  - `--color-surface-soft`: `#eaf0ff` (tinted court blue surface)
  - `--color-surface-warm`: `#f6d957` (padel-ball felt highlight surface)
  - `--color-ink`: `#17243e` (deep court navy)
  - `--color-muted`: `#556278` (slate court caption)
  - `--color-line`: `#dce2ec` (crisp court line divider)
  - `--color-accent`: `#244bd8` (cobalt court blue)
  - `--color-coral`: `#e96640` (clay court / focus accent)
- **Dark mode (`[data-theme="dark"]`):**
  - `--color-base`: `#0e1525` (night court floodlight navy)
  - `--color-surface`: `#172237` (elevated night panel)
  - `--color-surface-soft`: `#22314e` (muted cobalt surface)
  - `--color-surface-warm`: `#eacb51` (warm padel-ball yellow with `#17243e` ink)
  - `--color-ink`: `#f3f5fc` (soft chalk white)
  - `--color-muted`: `#b1bfd6` (cool mist)
  - `--color-line`: `#2f3e59` (night court line)
  - `--color-accent`: `#a7bcff` (luminous court blue with `#101b3d` ink)
  - `--color-coral`: `#ff9e7e` (warm clay focus)

### Typography
- Reliable zero-network system sans-serif stack with first-class Arabic fallbacks (`ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Arial, sans-serif`).
- Fluid display sizing (`clamp(2.35rem, 4.4vw + 0.5rem, 3.85rem)`), tight tracking in LTR (`-0.04em`), zero letter-spacing and generous `1.45` line-height in Arabic RTL (`[dir="rtl"]`).
- Sentence case across all headings, labels, and CTAs.

### Layout & marketing section architecture
We combine the **Premium Marketing Site** structural clarity (`components/sections/`, `components/ui/`, `components/layout/`, `features/marketplace/`) with PadelHub's server-rendered marketplace functionality:
1. **Header (`SiteHeader`):** Sticky-capable calm courtside bar with custom SVG `Brand`, section/route navigation (`Explore equipment`, `How it works`, `Why PadelHub`, `FAQ`), and `Preferences` (theme + locale switcher preserving query params).
2. **Hero + Integrated Search (`HeroSection` & `SearchPanel`):** Start-aligned split courtside hero with the primary outcome headline, direct value proposition, and tactile equipment specifications card alongside the photographic court visual. Immediately anchored by the full-width URL-driven search & filter bar and category pills so mobile and desktop users can search without scrolling past marketing fluff.
3. **Marketplace Showcase (`MarketplaceSection`):** The live filterable demo equipment grid (`ListingCard` with frame/face condition disclosures, EGP pricing, governorate/district location, and seller link).
4. **Why PadelHub / Value Proposition (`FeaturesSection`):** Editorial asymmetric bento/split showcase highlighting what makes PadelHub specific to Egyptian padel:
   - *Detailed racket & ball disclosures* (frame scuffs, crack/repair status, pressurization & pack count — not vague "good condition" text).
   - *Shareable seller storefronts & QR codes* (built for club courtside sharing in Maadi, New Cairo, and Sheikh Zayed).
   - *Direct WhatsApp bridge, 0% commission* (no escrow delays, no checkout fees; meet and inspect in person).
5. **How It Works Sequence (`HowItWorksSection`):** True 1–2–3 sequence from browsing/inspecting disclosures to tapping WhatsApp (no buyer account required) to courtside inspection & handover.
6. **Interactive FAQ (`FaqSection`):** Accessible native `<details>` accordion answering real buyer/seller questions (manual approval by Ziad, private-by-default profiles, swap vs. sale rules, zero fees, demo status).
7. **Community & Final CTA (`CommunityCtaSection`):** Warm courtside callout inviting players to explore the catalog or learn how the pilot works, followed by `SiteFooter`.

```text
Desktop (1200px container):
+-----------------------------------------------------------------------+
| [PadelHub.]   Explore   How it works   FAQ     [Theme v] [العربية]    |
+-----------------------------------------------------------------------+
| [Egypt's padel marketplace]        |  [Photographic Court Equipment]  |
| Your next game starts here.        |  +----------------------------+  |
| Inspect frame condition, compare   |  | Spec inspection preview    |  |
| EGP prices & connect on WhatsApp.  |  +----------------------------+  |
+-----------------------------------------------------------------------+
| [ Search: Try Head, Vertex, balls...          ] [Refine +] [Find eq.] |
| ( All equipment )  ( Rackets )  ( Balls )                             |
+-----------------------------------------------------------------------+
| Demo collection · 3 finds                                             |
| +--------------------+ +--------------------+ +--------------------+  |
| | Head Delta Motion  | | Bullpadel Vertex 03| | Head Padel Pro · 3 |  |
| +--------------------+ +--------------------+ +--------------------+  |
+-----------------------------------------------------------------------+
| Built for Egyptian courts, not generic classifieds                    |
| [Asymmetric editorial feature breakdown: Disclosures | QR | WhatsApp] |
+-----------------------------------------------------------------------+
| How PadelHub works (1 -> 2 -> 3 true sequence)                        |
+-----------------------------------------------------------------------+
| Frequently asked questions (Accessible accordion)                     |
+-----------------------------------------------------------------------+
```

### Brand-specific critique (what we changed vs. generic AI marketing sites)
- **Rejected:** Generic SaaS pricing tables, fake "10,000+ happy players" counters, fabricated testimonials, purple/neon dark-mode gradients, and floating biscuit pills.
- **Replaced with:** Real padel domain specifics — racket shape/weight/surface disclosure previews, EGP currency formatting, Cairo district context (Maadi, New Cairo, Sheikh Zayed), and honest pilot/demo framing.
- **The One Memorable Moment:** An interactive **Racket & Ball Inspection Breakdown** card integrated into the marketing experience that lets players toggle between inspection points (Face & Carbon Weave, Frame & Bumper Guard, Pressurized Canister Check) with calm GSAP-powered (or reduced-motion instant) transitions.

### Folder structure & code readability best practices
Per user request for best folder structures and clean, readable, maintainable code:
- Format every file with clean multi-line indentation, explicit TypeScript interfaces, and clear JSDoc comments where helpful (replacing the previous minified single-line JSX files).
- Organize `src/` cleanly:
  - `src/app/[locale]/`: Thin route entrypoints (`layout.tsx`, `page.tsx`, `about/page.tsx`, `equipment/[id]/page.tsx`, `sellers/[username]/page.tsx`).
  - `src/components/layout/`: `site-header.tsx`, `site-footer.tsx`.
  - `src/components/sections/`: `hero-section.tsx`, `features-section.tsx`, `how-it-works-section.tsx`, `faq-section.tsx`, `community-cta-section.tsx`, `inspection-showcase.tsx`.
  - `src/components/ui/`: Reusable semantic primitives (`container.tsx`, `section-header.tsx`, `badge.tsx`).
  - `src/features/marketplace/`: Domain logic & marketplace components (`demo-data.ts`, `equipment-art.tsx`, `listing-card.tsx`, `search-panel.tsx`, `category-pills.tsx`, `marketplace-page.tsx`, `equipment-detail-view.tsx`, `seller-profile-view.tsx`).
  - `src/lib/`: Shared utilities (`format.ts`).
  - `messages/`: Bilingual copy in `en.json` and `ar.json` (preserving all existing keys required by E2E tests and adding structured marketing copy).
