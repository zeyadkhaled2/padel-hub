# Application organization

One modular Next.js App Router application with TypeScript strict mode. No separate API service or monorepo is needed for the pilot.

- `src/app/[locale]`: localized routes and thin page composition; route-specific loading/error boundaries when needed.
- `src/components`: reusable shell and interaction controls, independent of business data.
- `src/features/marketplace`: equipment UI, explicitly typed demo fixtures and filtering. Future production repository functions must be separate from fixtures.
- `src/i18n`: supported locales, request messages and localized navigation.
- `messages`: English and Arabic UI strings.
- `tests/e2e`: browser behavior tests.
- `docs`: product scope, design, architecture and live handoff log.

Add `src/server` for server-only integrations and `supabase/migrations` when database work starts. Do not introduce empty service/repository wrappers. Domain mutation interfaces, RLS and audit behavior will be designed before wiring production data.

## Boundaries
Server-render routes and filter data on the server. Theme selection is a small client island using next-themes. next-intl owns locale routing and message lookup. Tailwind is installed for utilities; semantic CSS tokens provide the shared visual vocabulary. npm's committed lockfile pins dependency resolution.

Use the supported Webpack bundler for dev/build while the local Turbopack CSS subprocess failure is unresolved. TypeScript 6.0.3 is pinned because the installed lint integration rejects TypeScript 7. Keep tooling upgrades deliberate and rerun all checks after changes.

No Supabase, Railway or Resend resources are provisioned. No production account, upload, listing submission or contact endpoint exists. Local demo routes must never be mistaken for published inventory.

## Reference documentation
- Next.js setup: https://nextjs.org/docs/app/getting-started/installation
- next-intl routing: https://next-intl.dev/docs/routing/configuration

Consult current primary documentation before implementing integrations or changing framework APIs. Provider pricing must be rechecked before setup.
