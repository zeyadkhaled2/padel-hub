# Stage 0 — UI direction selection

Status: Ziad selected Sport-focused on 2026-11-13, requesting a much friendlier, more comfortable treatment and dark mode. The initial descriptions below are historical exploration; DESIGN_SPEC.md defines the refined direction. Local foundation implementation has begun.

The interactive preview was delivered in the project chat on 2026-11-13. It includes three visual directions, each with marketplace, listing detail and public seller profile views. Desktop/mobile and English/Arabic controls are included. All content is illustrative; there are no real inventory, seller or transaction claims.

## Clean marketplace
Light neutral surfaces, teal accents, compact sans-serif typography, explicit desktop filters and a uniform equipment grid. Prices are prominent. This is the recommended starting point for quick equipment discovery.

## Sport-focused
Dark navigation, green accents, strong uppercase English headings, squared controls and an asymmetric equipment grid. Arabic uses natural Arabic text rather than uppercase styling. This direction emphasizes sporting identity.

## Seller-profile-first
Warm ivory surfaces, brown accents, editorial English headings, prominent seller identity and horizontal equipment rows. Public storefronts and profile sharing are more prominent.

## Shared illustrative content
Omar Hassan (@omar_padel), an individual seller in Maadi, Cairo. Head Delta Motion at EGP 4,200, Bullpadel Vertex 03 at EGP 5,800, and a three-ball Head Padel Pro offer at EGP 280. These are demo prices, not market research. Equipment artwork is illustrative, not a representation of uploaded seller photos.

## Preview limits
Controls switch views, viewport size and language locally. Search, filters, sign-in, publishing, sharing and WhatsApp are design demonstrations, not connected application features. The Head Delta Motion listing supplies the common detail view. Gallery views use illustrations. No real phone number, QR target, authentication, storage or analytics is configured.

## After selection
1. Record Ziad's selected direction and requested adjustments.
2. Finalize a design specification: color and typography tokens, spacing, responsive navigation, controls, cards, forms, mobile filter sheet, Arabic RTL, keyboard and focus behavior.
3. Specify loading, empty, error, upload progress/retry, private/pending/rejected/active/reserved/sold/traded/archived and suspended states. These states are not all represented in the initial direction previews.
4. Proceed to Stage 1 foundation and prioritized acceptance criteria under PRODUCT_PLAN.md. Recheck current provider pricing before any service setup and obtain relevant authorization for paid services or publication.

Validation: JavaScript syntax and 36 combinations of direction, screen, viewport setting and language rendered in a DOM stub without errors. This does not replace browser visual inspection, accessibility testing or eventual application tests.
