---
name: premium-marketing-site
description: Build modern, minimal, comfortable-feeling marketing websites and landing pages in Next.js (App Router) with Tailwind v4 and GSAP motion. Use this skill whenever the user asks for a marketing site, landing page, product page, startup site, portfolio, or any polished front end in Next.js, and whenever GSAP, ScrollTrigger, smooth scrolling, scroll animation, or "high-end / premium / modern minimal" design is mentioned, even if they don't name this skill. Covers design direction, tokens, typography, layout, GSAP + Lenis setup that works in React/Next.js, performance, accessibility, SEO, and a quality checklist.
---

# Premium marketing site (Next.js + Tailwind v4 + GSAP)

Goal: a site that looks designed for one specific brand, feels calm and comfortable, and moves with restraint. Quality comes from decisions made before coding, a small consistent token system, and disciplined motion. Not from piling on effects.

If the official GSAP skills are installed (`gsap-core`, `gsap-react`, `gsap-scrolltrigger`, `gsap-timeline`, `gsap-plugins`, `gsap-performance`), follow them for API details. This file covers how to apply GSAP to a marketing site.

## Workflow (do these in order)

1. **Ground the brief.** State in 2-3 lines: what the product is, who the audience is, and the single conversion goal (sign up, book a call, buy). If any of these is missing, propose one and say it is an assumption.
2. **Write a compact design plan before any code** (see "Design plan"). Then check it against the brief: if any part is what you would produce for any similar site, change it and say what you changed.
3. **Scaffold** the project and tokens first, then build one section at a time, top to bottom.
4. **Critique after each section** with a screenshot at mobile and desktop widths. Fix before moving on.
5. **Run the quality gate** (end of this file) before saying you are done.

## Default stack (what most production marketing sites use)

- Next.js 16+ (App Router), React 19, TypeScript, statically generated pages where possible.
- Tailwind CSS v4 with tokens in a single `@theme` block in `globals.css` (no JS config needed).
- GSAP 3 (free, including ScrollTrigger and SplitText) with `@gsap/react` (`useGSAP`).
- Lenis for smooth scrolling, driven by the GSAP ticker. Package name is `lenis`.
- `next/font` for fonts, `next/image` for images, `lucide-react` for icons.
- shadcn/ui (Radix) only for accessible primitives such as dialog, accordion, and navigation menu. Restyle them to the tokens; never ship them in default style.
- Biome or ESLint, plus Playwright for screenshots.
- One animation system: **GSAP**. Do not animate the same elements with both GSAP and Framer Motion/Motion. Use CSS transitions for simple hover and focus states.
- Do not add Three.js/WebGL unless the brief asks for it. It costs performance and rarely helps a marketing page.

Suggested structure:

```
src/
  app/ (layout.tsx, page.tsx, globals.css, sitemap.ts, robots.ts, opengraph-image.tsx)
  components/
    providers/SmoothScroll.tsx
    sections/ (Hero, Proof, Features, HowItWorks, Pricing, Faq, FinalCta)
    ui/ (Button, Container, Heading ...)
  hooks/ (useReveal.ts)
  lib/ (content.ts, gsap.ts)
```

Keep all copy in `lib/content.ts` so sections stay presentational.

## Design plan (write this first, keep it short)

- **Color:** 4-6 named hex values (base, surface, ink, muted, line, one accent). Never pure `#000` on pure `#fff`: use a slightly soft ink and a slightly soft base. That softness is most of what reads as "comfy".
- **Type:** the families and their roles (see Typography).
- **Layout concept:** a one-sentence description plus an ASCII wireframe of the hero and one other section. State alignment (left or centered) once and keep it.
- **Principles:** 3 bullet points on what makes this site specific to this brand.
- **The one memorable moment:** pick exactly one signature element (a hero treatment, one scroll sequence, one interactive piece). Everything else stays quiet.

### Avoid the generic AI defaults unless the brief asks for them

These show up on generated sites regardless of subject, so treat them as defaults, not choices:
- Warm cream background with a high-contrast serif and a terracotta/clay accent.
- Near-black background with a single acid-green or vermilion accent.
- Purple/blue gradient washes as decoration.
- The identical-rounded-cards grid with the same soft grey shadow on everything.
- A tracked-out ALL-CAPS eyebrow above every heading, `01 / 02 / 03` numbering on content that is not a sequence, "A · B · C" meta strings, and "→" on every link.
- Accenting one word in every headline with italic or a different color.
- Fade-and-slide-up on every section and hover lift on every card.

"Modern minimal comfy" is achieved with: generous whitespace, a restrained palette with one accent, large readable type, soft but varied radii (not one radius everywhere), almost no shadows, and slow, calm easing.

## Tokens (Tailwind v4)

Define everything in `@theme`; components use only tokens.

```css
@import "tailwindcss";

@theme {
  --color-base: #f6f5f2;     /* choose deliberately for this brand */
  --color-surface: #ffffff;
  --color-ink: #1d1f24;
  --color-muted: #6b6f78;
  --color-line: #e3e2de;
  --color-accent: #3b5bdb;   /* one accent only */

  --font-display: var(--font-display-family);
  --font-sans: var(--font-sans-family);

  --radius-sm: 8px;
  --radius-md: 14px;
  --radius-lg: 28px;

  --ease-calm: cubic-bezier(0.22, 1, 0.36, 1);
}
```

Spacing: use an 8px base scale. Section padding roughly `clamp(5rem, 10vw, 10rem)` vertical. Container max-width about 1200px with generous side padding on mobile.

## Typography

- One family, or two that are clearly distinct. Choose them for this brand, not the ones you reach for every time. Load with `next/font` (`display: "swap"`, subset, only needed weights), and expose them as CSS variables.
- Fluid scale with `clamp()`, e.g. hero `clamp(2.5rem, 6vw + 1rem, 5.5rem)`, body 17-19px.
- Line length under about 70 characters for body text; tight leading on large headings, more generous on body.
- Sentence case. Headings should be real sentences that say what the product does.

## Layout and marketing structure

Default section order (drop what the brief does not need):

1. Header: logo, 3-5 links, one primary button. Sticky is optional; keep it light.
2. Hero: one headline stating the outcome, one supporting line, one primary CTA (at most one secondary). Show the product, a demo, or a real image, not an abstract gradient.
3. Proof: logos, a number with real context, or a short quote.
4. Features/benefits: vary layout (not a grid of identical cards). Pair each with a concrete visual or example.
5. How it works: only use numbers if it truly is a sequence.
6. Pricing (if applicable) and FAQ (use an accessible accordion).
7. Final CTA, then footer.

Rules:
- One primary action per screen, named by what it does ("Start free trial", "Book a demo"), not "Submit".
- Write real copy from the brief. If none exists, write specific, plain-language copy and flag it as draft. No lorem ipsum, no "Revolutionize your workflow".
- Each element does one job. Cut decoration that does not serve the message.
- Real images or product screenshots beat stock-looking illustrations. If there are none, use clean placeholders sized correctly and say so.

## Motion with GSAP (the part agents get wrong)

### Principles

- **Spend boldness in one place.** One orchestrated hero entrance and one signature scroll moment. Elsewhere use a single, consistent, subtle reveal (or none).
- Animate only `transform` (x, y, scale, rotate) and `opacity`/`autoAlpha`. Never animate `top`, `left`, `width`, `height`, or box-shadow in scroll sequences.
- Calm timing: durations 0.6-1.2s, ease `power3.out` or `expo.out`, staggers 0.05-0.12s, travel distance 16-40px. Fast and bouncy reads cheap.
- Motion must carry meaning (draw attention, show cause and effect). Do not animate just because you can.
- Limit pinned/scrubbed sections to one or two per page, and keep their scroll length reasonable.

### Setup in Next.js (client-only, SSR-safe)

- Any component that uses GSAP, ScrollTrigger, or Lenis is a client component (`"use client"`). Keep server components for content and layout; animate small client wrappers or section components.
- Register plugins once in a shared client module, and never touch `window`/`document` at module top level except inside hooks/effects.

```ts
// src/lib/gsap.ts
"use client";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

export { gsap, useGSAP, ScrollTrigger, SplitText };
```

### Always use `useGSAP`, with a scope

`useGSAP` handles context creation and cleanup (and React Strict Mode double-invocation). Prefer it to raw `useEffect` + manual cleanup.

```tsx
"use client";
import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";

export function Features() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-reveal]", {
          y: 24,
          autoAlpha: 0,
          duration: 0.9,
          ease: "power3.out",
          stagger: 0.08,
          scrollTrigger: { trigger: root.current, start: "top 80%", once: true },
        });
      });
    },
    { scope: root }, // selectors are limited to this section
  );

  return <section ref={root}>{/* children carry data-reveal */}</section>;
}
```

Rules:
- Pass `{ scope: ref }` so string selectors only match inside the component.
- Wrap animations that run later (click/hover handlers) with `contextSafe` from `useGSAP`, so they are cleaned up.
- Create `gsap.matchMedia()` inside the `useGSAP` callback so it reverts with the context.
- Do not create ScrollTriggers in loops without scoping them; do not leave global `ScrollTrigger.create` calls that never get killed.

### Responsive and accessible motion

- Wrap all non-essential motion in `matchMedia` with `(prefers-reduced-motion: no-preference)`. In the reduced branch, show the final state with no movement.
- Use separate branches for desktop and mobile (`(min-width: 900px)` vs smaller). Pinned/scrubbed sequences are usually desktop-only; give mobile a simple stacked layout with light reveals.

### Avoid flash of unstyled content

- Below-the-fold elements animated with `gsap.from` + `autoAlpha` are fine, since they are offscreen on load.
- For above-the-fold hero elements, hide them with CSS in a way that does not break no-JS or reduced-motion users (for example `@media (prefers-reduced-motion: no-preference)` hiding the hero items, and revealing them from GSAP), then animate to visible.
- Do not delay the LCP element behind a long fade. Keep the hero headline/image entrance under about 0.8s, or animate a wrapper while the LCP content is already painted.

### ScrollTrigger hygiene

- After fonts and images settle, call `ScrollTrigger.refresh()`:
  `document.fonts.ready.then(() => ScrollTrigger.refresh())`.
- Give every image explicit `width`/`height` (or `fill` with a sized parent) so layout does not shift under pinned sections.
- Use `once: true` for simple reveals. Use `scrub` only for sequences that should be tied to scroll.
- Prefer `start: "top 80%"` style positions that are easy to reason about; avoid magic pixel values.
- Debug with `markers: true` locally and remove before shipping.
- Prefer one timeline per sequence (`gsap.timeline({ scrollTrigger })`) with labels and position parameters over many chained delays.

### SplitText for headlines (use sparingly)

- Use `SplitText` with `autoSplit: true` and create the animation in `onSplit`, so it re-splits on resize/font load, and clean up through the context.
- Split by lines or words for headlines only. Do not split body paragraphs.
- Keep `aria-label`/semantic text intact (SplitText handles `aria` by default); do not hide real text from screen readers.

### Lenis smooth scroll, wired to GSAP

```tsx
// src/components/providers/SmoothScroll.tsx
"use client";
import { useEffect } from "react";
import Lenis from "lenis";
import { gsap, ScrollTrigger } from "@/lib/gsap";

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const lenis = new Lenis({ autoRaf: false });
    lenis.on("scroll", ScrollTrigger.update);

    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
```

- Mount it once in `layout.tsx`.
- Anchor links fight Lenis. Route same-page hash links through `lenis.scrollTo(target, { offset })` (expose the instance via context or a ref) instead of native anchor jumps.
- Test on a real phone. If scrolling feels heavy on mobile, disable Lenis below a breakpoint.
- Never lock scrolling for long intros. Users should be able to scroll immediately.

## Performance budget

- Target Lighthouse mobile 90+ for performance and 100 for accessibility/best-practices/SEO where realistic.
- Prefer static generation. Lazy-load below-the-fold client components with `next/dynamic`. Import only the GSAP plugins you use.
- Hero image: `priority`, correct `sizes`, modern formats. Other images lazy.
- Video: short, compressed, muted, `playsInline`, with a poster, and a lighter mobile version. Never autoplay heavy video without a fallback.
- Avoid layout shift (CLS < 0.1): reserve space for images, fonts use `next/font`.
- Use `will-change` only on elements that animate continuously, and remove it after.

## Accessibility

- Semantic landmarks (`header`, `main`, `nav`, `footer`), one `h1`, ordered headings.
- Color contrast at least 4.5:1 for body text (3:1 for large text); do not rely on color alone.
- Visible `:focus-visible` styles on every interactive element, keyboard-reachable menus and accordions.
- Respect `prefers-reduced-motion` everywhere (see above), including Lenis.
- Meaningful `alt` text; decorative images get `alt=""`.
- Tap targets at least 44px on mobile.

## SEO and marketing basics

- Use the Metadata API: title, description, canonical, Open Graph, Twitter card. Add `opengraph-image`, `sitemap.ts`, `robots.ts`.
- Add JSON-LD (Organization/Product/FAQ where relevant).
- Forms: server actions or a lightweight API route, with validation, clear error text, and a visible success state. Honeypot or rate limiting for spam.
- Analytics: lightweight and consent-aware where required. Do not let scripts block rendering.

## Quality gate (run before finishing)

1. `build` and `lint` pass with no errors; no console errors or hydration warnings.
2. Screenshots at 390px, 768px, and 1440px. Check spacing rhythm, text wrapping, overflow, and that the hero shows its key message and CTA without scrolling.
3. Reduced-motion check: with the OS setting on, content is visible and nothing moves.
4. Scroll through the whole page: no jumps, no stuck pins, no content that never appears, ScrollTrigger positions correct after fonts load.
5. Keyboard-only pass: tab order sensible, focus visible, menus/accordion work.
6. Lighthouse run; fix anything below target that is not intentional.
7. Final critique, Chanel-style: remove one decoration. Check the page has exactly one memorable moment and everything else is calm.

## Anti-patterns checklist

- Animating everything on scroll. Choose, then repeat one pattern.
- Mixing animation libraries on the same elements.
- `gsap.registerPlugin` or plugin imports scattered across components.
- GSAP code in server components, or touching `window` during render.
- Pinned sections on mobile that trap scroll.
- Hero content hidden until a long intro finishes.
- Stock gradient orbs, glassmorphism everywhere, and identical card grids.
- Placeholder copy left in the final output.
- Declaring done without screenshots or a build.
