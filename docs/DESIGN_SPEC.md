# Friendly sport â€” selected direction

Selected by Ziad on 2026-11-13. The sport identity remains; the initial sharp, forceful treatment is replaced with a calmer, welcoming interface. This specification guides the first implementation and can be refined with feedback.

The initial muted treatment was superseded at Ziad’s request on 2026-11-14. Current implementation and rationale: REDESIGN.md; asset source and prompts: ASSET_PROVENANCE.md. Historical refinement: see DESIGN_REFINEMENT.md and `.agents/skills/calm-nextjs-design/SKILL.md`. Search follows a compact yellow-and-photographic hero. Category shortcuts preserve URL search/sort. Product cards lead with clearly labeled generated demo imagery. Native scrolling is intentional.

## Personality and composition
Use sentence-case headings, conversational copy, purposeful whitespace, rounded controls and court-inspired cobalt, yellow and coral. Avoid dense navigation and invented trust statistics. Prioritize equipment discovery, then seller identity. Public contact happens on WhatsApp; never imply on-platform checkout.

## Theme and tokens
CSS variables in `src/app/globals.css` are the source of truth. Light: cool off-white canvas, white surfaces, navy text and cobalt actions. Dark: deep navy canvas, elevated blue surfaces, pale text and periwinkle actions. A warm yellow hero retains navy text in both themes. Every surface, border, input, focus state and muted label must use semantic tokens. Do not invert images in dark mode.

Support System (default), Light and Dark, with local preference persistence. Apply the theme before paint using next-themes; isolate hydration suppression to the root HTML element. Controls must remain usable without local storage. Native form color-scheme follows the resolved theme.

## Typography and spacing
Use a reliable local system sans-serif stack with Arabic-capable fallbacks, avoiding build-time font downloads. Body 16px, comfortable line height 1.6; secondary text at least 12px. Headings use moderate weight and fluid size. Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64px. Card radius 20px; control radius 12px. Primary interactive targets at least 44px. Keep desktop content within 1200px.

## Responsive layout and navigation
Desktop: light/navy header with custom padel logo, split photographic hero, search/filter form and a three-column equipment grid. Tablet uses two columns. Mobile: wrap navigation and controls without horizontal scrolling, stack search, use a native expandable filter panel and one-column cards. Keep theme and language controls visible. Preserve query/filter state on language switching. RTL uses logical margins, padding and alignment; do not mirror brand names or numbers arbitrarily.

## Cards and detail pages
Lead with equipment image/illustration, condition, title and offer price in EGP. Show location and seller without verification badges. Demo artwork and prices must be visibly labeled. Detail pages group disclosure text with the gallery and seller/contact section. Generated images are unbranded illustrative assets, not depictions of the named models. Permissioned seller photos require the future upload flow. Sold/traded/reserved states disable contact. Pending/private content never reaches public routes in the production implementation.

## Controls and forms
Use native inputs/selects and visible labels. Search/filter state belongs in the URL. Pair errors with the affected field and retain entered values. Use descriptive action text. No dead buttons or fabricated success messages; unavailable backend actions are explicitly explained. No icon-only primary actions. Use a visible skip link and focus ring.

## Required state behavior
- Loading: stable geometry, restrained skeletons and an accessible loading message; respect reduced motion.
- Empty: explain why no listings match and offer a filter reset.
- Error: actionable retry with retained inputs, no secret or stack-trace exposure.
- Upload: progress, retry and preserved previous image on failure.
- Draft/pending: private, with explicit submission/review status.
- Rejected: reason, edit and resubmit; retain images.
- Active: discoverable only after approval and with public contact enabled.
- Reserved/sold/traded: direct page explains status, contact disabled.
- Archived/removed/suspended: no active discovery; privacy rules apply to media, aliases and metadata.
- Approved-content edit: explain that re-review removes the listing from discovery.

Only foundation states are implemented in this session. Production moderation, upload, account and private-data states remain backlog items in PROGRESS.md.
