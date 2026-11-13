# PadelHub

Egypt-first padel equipment marketplace. Current implementation is a local, bilingual design foundation with explicit demo inventory; no live marketplace services are connected.

## Start here
Read [progress and handoff](docs/PROGRESS.md), [product plan](docs/PRODUCT_PLAN.md), [design specification](docs/DESIGN_SPEC.md) and [architecture](docs/ARCHITECTURE.md). Future agents must follow [AGENTS.md](AGENTS.md) and update the progress log each session.

## Local development
Use Node.js 22 or newer and npm.

```sh
npm ci
npm run dev
```

Visit `http://localhost:3000/en` or `http://localhost:3000/ar`. No environment variables or external accounts are needed for demo pages.

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

Browser tests run a local development server on port 3100. Test reports and dependencies are ignored. Production build output is in `.next`; `npm start` serves it locally after a successful build.

If the Playwright browser download is unavailable and Chrome is installed, run `$env:PLAYWRIGHT_CHANNEL='chrome'; npm run test:e2e` in PowerShell. CI uses bundled Chromium. Dev/build use Next.js's supported Webpack option because Turbopack's CSS compiler subprocess failed on this Windows environment. TypeScript is pinned to 6.0.3 for lint-tool compatibility.

Screenshots of the current refinement are in [docs/previews](docs/previews). Full implementation and verification boundaries are recorded in the handoff log.

## Current boundaries
Search, category filtering, sorting, theme preference, language switching and demo detail/profile navigation are local foundation features. Authentication, persistence, media upload, moderation, QR sharing and WhatsApp contact are not implemented. No paid services or publishing are authorized. Demo routes are marked noindex.
