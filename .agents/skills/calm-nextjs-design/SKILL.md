---
name: calm-nextjs-design
description: Design and refine calm, distinctive Next.js interfaces with coherent tokens, responsive typography, accessible interaction and restrained motion. Use for visual frontend refinement or a polished Next.js landing page; preserve existing product flows and branding.
---

# Calm Next.js Design

Adapted from the user-supplied premium-marketing-site skill. The original is preserved in [references/original-skill.md](references/original-skill.md); read it for detailed GSAP/Lenis recipes when motion is actually needed. Treat its marketing defaults as guidance, not a replacement for the user's product requirements.

## Workflow
1. State the product, audience and primary action. Inspect the existing UI and constraints.
2. Write a compact design plan before edits: palette, typography, responsive composition, brand-specific choices and one memorable element. Critique any choice that would fit an unrelated brand unchanged.
3. Refine one meaningful section at a time. Prefer existing architecture and components to unnecessary scaffolding.
4. Inspect desktop/mobile screenshots and correct issues before continuing. Preserve dark mode, RTL and keyboard access when present.
5. Validate the finished result and record what was measured versus merely targeted.

## Design decisions
- Soft contrast, sentence case, readable body copy, generous but purposeful spacing, varied radii and almost no shadow.
- Use a semantic token system; expose it through Tailwind v4 @theme when appropriate. Theme variants must cover inputs, labels, borders and focus as well as backgrounds.
- Prefer one or two intentional font families. Use next/font when licensed font assets or reliable build-time downloads are available; keep robust Arabic fallbacks where needed.
- Show the actual product/task. Avoid gradient orbs, repeated arrows, decorative counters, identical marketing-card walls and default cream/serif/clay or acid-green palettes unrelated to the brand.
- Repeated product cards are appropriate for comparisons. Do not sacrifice marketplace usability to marketing variety.
- Keep the primary action visible early on mobile. Real proof only; clearly label concept art and demo data.
- Keep copy in the project's existing localization/content system. Do not replace bilingual messages with a new single-language content file.

## Motion
Motion is optional. Native scrolling and no animation are valid when they best serve the task. Do not install GSAP or Lenis solely because they appear in the reference stack.
When meaningful motion is requested, use one system (GSAP), scoped useGSAP cleanup, transform/opacity only, matchMedia for reduced motion, immediate scrolling and visible no-JS content. Avoid pinned mobile sequences. Follow the reference for API patterns, verifying current official docs before implementation.

## Quality gate
- Lint/typecheck/build and relevant browser journeys pass; inspect console and hydration output.
- Inspect 390, 768 and 1440px; verify both themes/locales when supported, no overflow, clear hierarchy and a reachable primary action.
- Check reduced motion, keyboard order, visible focus, semantic headings, form labels, text contrast and 44px touch targets.
- Run Lighthouse on a production build where available. Target mobile performance 90+, accessibility/best practices 100 and SEO 100 for indexable production pages. Report deliberate exceptions such as noindex demo inventory; never fabricate scores.
- Remove one unnecessary decoration. Retain only the memorable element that serves this brand.
- Document completed work, limitations and next steps using the project's handoff convention.

## Scope and release
Respect the user's explicit framework, domain behavior, security and data-retention requirements. Do not add analytics, checkout, fake testimonials or external services without task authorization. Deploy only to the user-authorized provider/account after validation. A skill is not authorization to publish, enable billing or replace infrastructure.
