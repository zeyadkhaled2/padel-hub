# Vercel frontend demo

Frontend deployment was explicitly requested by Ziad. The initial deployment is Ready at [PadelHub](https://padel-hub-beta.vercel.app). Vercel project: `padel-hub`, workspace: `zeyadkhaled2s-projects` (existing Hobby plan). GitHub main is connected for future deploys.

## Build and release
1. Run `npm run check` and relevant browser tests.
2. Review the Git diff and ensure no credentials, environment files or build output are staged.
3. Push approved work to `main`; inspect the matching Vercel deployment until Ready.
4. Smoke-test `/en`, `/ar`, filtering, equipment detail and theme/language switching on the public alias.

CLI fallback: `npx vercel deploy --prod --yes --scope zeyadkhaled2s-projects`. This machine requires the additional option `--global-config E:\projects\padelHub\.cache\vercel` due to a Windows global-config write error. Authenticate with `vercel login`; never paste tokens into source or logs. `.cache`, `.env*` and `.vercel` are excluded from both Git and deployment uploads.

The frontend uses Next.js server rendering for locale routes and URL search. It is not a static HTML export and needs no Supabase/Resend credentials yet. `vercel.json` supplies build/install settings. Keep `noindex` until demo inventory is replaced and the launch gates in PRODUCT_PLAN.md are met.

This frontend deployment does not establish production backup, auth, storage, moderation or monitoring readiness. Railway remains a prior architecture proposal; decide the eventual backend hosting arrangement separately before provisioning.
