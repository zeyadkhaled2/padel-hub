# Free-tier staging and production preparation

Updated 2026-11-27. Feature freeze remains active. Selected providers: Vercel Hobby, Supabase Free, Resend Free, GitHub Free. No paid services or production provisioning executed. Latest execution evidence is in PROGRESS.md.

## Monitoring procedure and thresholds

The operator checks dashboards daily during testing/pilot, and before each seller invitation batch. Record UTC time, environment, current usage, quota, reset date, and projected month-end usage in the private operations log. Use each dashboard's actual meter as authoritative; limits can change. Never combine staging and production usage silently.

For **every quota**, 50% means review growth and seven-day projection; 70% means investigate the largest consumers and reduce synthetic load/invitation batches; 90% means pause new invitations and bulk uploads until capacity is resolved. Preserve sign-in, reads, existing listings and saved images. Do not automatically delete files or enable paid overages. Escalate to the owner with a forecast and options.

- Supabase database: 500 MB per project; thresholds 250 / 350 / 450 MB. Staging SQL size was 15,382,195 bytes post-migration and 16,635,571 bytes (~3.3% decimal MB) after full hosted Vercel smoke runs; this is a point-in-time SQL measurement, not the billing dashboard meter.
- Supabase Storage: 1 GB; thresholds 0.5 / 0.7 / 0.9 GB. Pre-smoke baseline: 207 objects (61,070 bytes); post-hosted-Vercel smoke: 459 objects (149,536 bytes). Tiny synthetic images do **not** predict real camera-photo capacity.
- Supabase uncached egress: 5 GB; thresholds 2.5 / 3.5 / 4.5 GB. Cached egress has its own 5 GB allowance; monitor separately. Private server-proxied media must not be assumed to consume the cached allowance. Backups also consume bandwidth.
- Supabase monthly active users: 50,000; thresholds 25,000 / 35,000 / 45,000. Watch Auth rate-limit errors independently.
- Resend: 3,000 emails/month and 100/day; thresholds 1,500 / 2,100 / 2,700 monthly and 50 / 70 / 90 daily. Include confirmation, resend and recovery attempts; leave recovery headroom. Quotas are not delivery guarantees.
- Vercel Hobby: 4 active CPU hours (2 / 2.8 / 3.6), 360 GB-hours provisioned memory (180 / 252 / 324), 1,000,000 invocations (500k / 700k / 900k), 100 GB fast transfer (50 / 70 / 90), 10 GB origin transfer (5 / 7 / 9), and 1,000,000 CDN requests (500k / 700k / 900k). Check the project's actual compute model and meters before using these thresholds. Exceeding Hobby quotas can interrupt service.
- GitHub: inspect Settings → Billing and licensing → Usage for Actions minutes and artifact storage; use 50/70/90% of the allowance actually shown for this account/repository. Do not enable paid runners. Remove obsolete test artifacts under a reviewed retention policy; never confuse them with database/media backups.

Dashboard locations: Supabase organization → Usage (database, Storage, egress, MAU), project → Logs and Query Performance; Vercel team → Usage, project → Observability/Logs, deployment → Functions; Resend → Overview/Emails and plan Usage; GitHub → repository Actions and account Billing and licensing. Save runtime evidence promptly because Hobby logs have short retention. Record route, deployment, duration, memory and invocation deltas; redact tokens, email addresses, contact details and image URLs from shared reports.

Source checks on 2026-11-27: [Supabase pricing](https://supabase.com/pricing), [egress meters](https://supabase.com/docs/guides/platform/manage-your-usage/egress), [Vercel Hobby](https://vercel.com/docs/plans/hobby), [single-region support](https://vercel.com/docs/functions/configuring-functions/region), [Resend pricing](https://resend.com/pricing). These are capacity limits, not permission for commercial use; see [Vercel terms](https://vercel.com/legal/terms).

## Exact owner dashboard actions

1. **Hosted Vercel staging Preview (completed 2026-11-27):** Branch `staging` is live at `https://padel-hub-git-staging-zeyadkhaled2s-projects.vercel.app` (`dpl_GYAKq4kihpbzYbZG78kmnhVMaa8M`), verified **100% `fra1` (Frankfurt)** (`nodejs26.x`, Fluid Compute, `2,048 MB` provisioned, `244–289 MB` peak RAM, `0` HTTP 5xx, `7.6 s` total CPU across 200 invocations), with all 4 server-only variables scoped strictly to `Preview (staging)` (`0` Production env vars) and Vercel Deployment Protection + `noindex` intact.
2. **Update staging Supabase Auth Redirect URLs (required owner Dashboard step):** open Supabase → `padelhub-staging` (`sxghreukdkxclymysryp`) → **Authentication → URL Configuration**: set **Site URL** to `https://padel-hub-git-staging-zeyadkhaled2s-projects.vercel.app` and add exact **Redirect URLs**:
   - `https://padel-hub-git-staging-zeyadkhaled2s-projects.vercel.app/en/auth/callback`
   - `https://padel-hub-git-staging-zeyadkhaled2s-projects.vercel.app/ar/auth/callback`
   - `https://padel-hub-git-staging-zeyadkhaled2s-projects.vercel.app/en/auth/recovery`
   - `https://padel-hub-git-staging-zeyadkhaled2s-projects.vercel.app/ar/auth/recovery`
   *(Keep localhost redirects only if still needed for local staging tests; never add wildcards.)*
3. **Supabase Security & Performance Advisors (verified on staging 2026-11-27):** post-031 Management API advisor run on `padelhub-staging` returned **0 `ERROR`-level issues**, 0 mutable-search-path warnings, and 0 exposed private helpers (`WARN`: 4+40 intentionally scoped least-privilege `SECURITY DEFINER` RPCs + 1 plan-gated `auth_leaked_password_protection`; `INFO`: 7 deny-by-default tables with `FORCE RLS` and no policies; Performance `WARN`: 2 `multiple_permissive_policies` on `padelhub_review_writer`). Rerun **Advisors → Security** after any future migration and on the new production project.
4. **Email/domain:** choose the domain separately, then follow AUTH_DEPLOYMENT_RUNBOOK.md. Resend → Domains → Add `auth.<domain>` → copy exact DNS values into the registrar; verify all statuses, disable click/open tracking, create a domain-restricted sending key. Supabase → Authentication → Email/Emails → SMTP Settings: host `smtp.resend.com`, port 465, username `resend`, password the sending key, sender `no-reply@auth.<domain>`, name Raketna. No API key goes in Git or browser variables.
5. **Redirects/templates:** Supabase → Authentication → URL Configuration: exact Site URL and EN/AR callback and recovery URLs for that environment only. Authentication → Email Templates: install repository confirmation/recovery templates. Keep email confirmation on and anonymous sign-in off. Verify real-inbox delivery, one-use confirmation/recovery, both languages, mobile mail opening, and expired/reused links. Generated test links prove Auth behavior, not SMTP delivery.
6. **Account security and eligibility:** enable operator 2FA on GitHub, Vercel, Supabase and Resend. Resolve Vercel Hobby eligibility for the intended real-seller activity before invitations; no upgrade or host migration is preauthorized.
7. **Operational ownership:** assign the backup/deletion operator and recovery contact. Encrypt and independently retain daily DB/roles/permission catalogs and media manifests/objects. Rehearse restoration. Run the physical iPhone Safari and Android Chrome checklist, including real HEIC, cancellation/retry and WhatsApp.

## Production checklist — preparation only, separate approval required

- [ ] Approve production provisioning explicitly after eligibility, domain, email and device gates are satisfied.
- [ ] Create a distinct Supabase Free project in Frankfurt; verify available free project slots. Never reuse staging credentials, records or test admins.
- [ ] Record project identity and secure credentials. Apply migrations 001–005; follow the documented hosted 006 supersession/repair procedure; continue 007–031 in order. Preserve migration files. The staging runner deliberately refuses a different project; do not change its pin to production. Use explicit production-targeted CLI commands with reviewed project identity and a new operator configuration.
- [ ] Create private `media-private`, 8 MiB bucket limit, only `image/webp`; verify all 23 domain tables FORCE RLS, client grants, helper grants, capability roles and Security Advisors.
- [ ] Set only production's four server runtime variables in Vercel Production. Preview retains only staging credentials. Confirm build/runtime environment isolation and `fra1` deployment output.
- [ ] Add the approved custom domain in Vercel Settings → Domains; apply the exact displayed DNS records, verify HTTPS and canonical redirects. Set production origin, exact Auth callbacks/recovery redirects and Resend SMTP/templates.
- [ ] Create the real admin through verified signup, grant its immutable Auth ID in `private.admin_roles` through the operator connection, enroll TOTP and test AAL1/non-admin/revoked denial. Never use user metadata as authorization.
- [ ] Verify clean production data; run an explicitly approved minimal synthetic launch check and retain or manually clean its data under the runbook. Never import the staging dump into production.
- [ ] Take encrypted database, role/ACL/migration and separate media backups; verify hashes and restore into an isolated authorized recovery target. Test permission parity, RLS and owner/admin isolation, media retrieval, and durable-manifest cleanup retries. Record achieved RPO/RTO; no claim of hosted restore success until executed.
- [ ] Repeat sign-in/signup/recovery, seller creation/editing/submission, moderation and immediate revocation, buyer browsing/contact and account deletion on the actual production origin. Complete real physical-device sign-off.
- [ ] Record owner go/no-go, on-call moderation/backup ownership and quota baseline before inviting real sellers.

## Performance procedure & hosted `fra1` baseline (2026-11-27)

Live baseline recorded on `https://padel-hub-git-staging-zeyadkhaled2s-projects.vercel.app` (`dpl_GYAKq4kihpbzYbZG78kmnhVMaa8M`, `fra1` Frankfurt → `padelhub-staging` `eu-central-1`, synthetic dataset):
- **Client RTT from Egypt**: first cold `/en` `2,765 ms`; warm p50 browse `239 ms`, filtered `212 ms`, detail `215 ms`, storefront `199 ms`, media `200` proxy `306 ms`, media `304` `If-None-Match` `215–300 ms`; photo uploads `2,004 ms` cold / `541–695 ms` warm (`109–124 ms` Sharp server CPU).
- **Vercel `fra1` function telemetry (200 invocations)**: 100% `fra1`, 0 HTTP `5xx`, `7.6 s` total CPU (~0.05% of 4 hr/mo Hobby cap), `244–289 MB` peak RAM / `2,048 MB` provisioned; server p50 durations `/[locale]` `10 ms`, detail `69 ms`, storefront `64 ms`, `/api/media` `227 ms`, `/api/listings/[listingId]/photos` `446 ms` (`444 ms` cold start, `252 MB` peak RAM).

Repeat this check on real phone networks and after production provisioning (comparing p50/p95 and invocation/query/egress deltas in built-in dashboards). Marketplace code uses one paginated search RPC, not a per-card detail RPC. Private photos intentionally authorize at delivery time; retain this architecture and immediate revocation. Do not weaken authorization or add public caching to improve a benchmark. No demonstrated query bottleneck has justified an optimization in this session.
