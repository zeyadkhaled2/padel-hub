> Historical design, superseded by Ziad�s requested courtside redesign on 2026-11-14. See REDESIGN.md.

# Calm sport refinement — 2026-11-13

## Brief
PadelHub connects Egyptian padel players with equipment sellers. The primary frontend action is finding suitable equipment; production contact will happen on WhatsApp. This deployment remains an explicitly labeled demo, not a live marketplace.

Apply the supplied skill as design guidance, preserving the approved sport identity, Arabic RTL, dark mode, existing domain structure and marketplace scope. Do not add pricing, fabricated social proof, smooth-scroll interception or unnecessary animation libraries just because a marketing template lists them.

## Design plan before implementation
- Color: light base `#f7f9f4`, soft surface `#fcfdf9`, ink `#20382e`, muted `#52675a`, line `#dce5d9`, green accent `#295e46`. Dark values retain the current forest palette; no neon accent wash.
- Type: retain the system sans-serif stack with Arabic fallbacks for reliable offline builds. Sentence case, 17–18px supporting text, fluid display sizing. Local font files can be adopted later when a licensed brand family is chosen.
- Layout: start-aligned discovery hero, search embedded with the headline, one equipment-focused visual on desktop; mobile shows headline and search before any illustration. Compact navigation and quiet editorial section labels.
- Signature: one large illustrated racket on court lines, explicitly labeled as concept artwork. No looping motion or scrolling lock. Product imagery remains illustrative until permissioned seller photos exist.
- Brand principles: equipment before marketing; Egyptian location and EGP visible; Arabic gets the same layout quality as English.

```text
Desktop: [logo / explore / how / language / theme]
         [headline + brief copy | equipment study]
         [search + filters      | concept caption]
         [latest equipment / count]
         [listing] [listing] [listing]

Mobile:  [logo / language / theme]
         [navigation]
         [headline + short copy]
         [search action + filters]
         [latest equipment]
         [listing / listing / listing]
```

## Critique and changes
The previous hero used a generic decorative ball/court plus a slogan and placed search below the mobile fold. Replace that decoration with equipment artwork on desktop and remove it on mobile. Remove repeated arrows, decorative dots, letter-spaced eyebrows and extra card outlines. Keep consistent product cards because comparing equipment benefits from repeated structure; do not turn the marketplace into a generic marketing landing page.

## Motion decision
Native scrolling and subtle color/focus transitions only. No GSAP or Lenis dependency is warranted for the current search-first task. All content must be visible without JavaScript and in reduced-motion mode. Add GSAP later only for a specific useful interaction, with scoped cleanup and reduced-motion support per the skill reference.

## Deployment
User explicitly authorized a Vercel frontend deployment in this session. Keep noindex for demo inventory; do not add Product JSON-LD, fake inventory availability, analytics, accounts or payments. Use the existing Next.js server rendering on Vercel; the frontend is not a static export because search and locale routes are server-rendered. No backend services or paid upgrade are authorized.

## Quality checks
Run lint/typecheck/build and browser journeys, inspect 390/768/1440px in both locales/themes, test reduced motion and keyboard navigation, and run Lighthouse against the production build. Record measured results and limitations in PROGRESS.md before handoff.
