# Working on PadelHub

- Start with `docs/PROGRESS.md`, then `docs/PRODUCT_PLAN.md`, `docs/DESIGN_SPEC.md` and `docs/ARCHITECTURE.md`.
- Ziad selected Sport-focused with a friendly, comfortable feel and light/dark themes. The initial UI selection gate is resolved.
- Update `docs/PROGRESS.md` after every completed work session: changes, exact checks/results, limitations, decisions and concrete next steps. Never describe untested or unfinished behavior as done.
- Preserve existing work. Keep demo data clearly labeled and separate from future production data.
- Keep routes thin in `src/app`; domain UI/logic in `src/features/<domain>`; reusable UI in `src/components`; locale configuration in `src/i18n`; text in `messages`.
- Prefer Server Components. Use client components only where interaction or browser state needs them. Keep secrets and authorization on the server.
- Use semantic theme tokens, logical CSS properties, accessible labels, keyboard focus and Arabic RTL. Verify light/dark and narrow layouts when changing UI.
- Run `npm run check` and relevant browser tests before handoff; record any blocked checks honestly.
- Never publish, create paid services or enable billing without relevant authorization.
- Follow the approved product constraints: manual listing approval, private-by-default profiles, no checkout, no automatic listing expiry or deletion of attached images.
- Future mutations require ownership checks, RLS, validation and conflict protection. Never trust user-editable metadata for admin roles.
- Add folders and dependencies when needed, not empty speculative layers. Commit the lockfile; do not commit secrets, generated output or dependencies.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
