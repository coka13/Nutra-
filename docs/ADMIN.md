# Fitura+ administration console

A separate, server-authorized console for operating the product. It lives in the same Next.js
app and database, but uses its own accounts, sessions, cookie, API namespace and host.

## What it covers

| Area | Route | Main capabilities |
| --- | --- | --- |
| Dashboard | `/admin` | Registered/active users, DAU/WAU/MAU, coaches, independent vs. coach-assigned trainees, registrations, 7-day retention, Plus/coach subscribers, complimentary ad-free users, estimated MRR, collected revenue, cancellations, ad revenue/impressions, AI requests/tokens/cost, DB and photo storage, API error rate and latency. Date-range presets or custom range, growth vs. previous period, interactive charts. Finance figures only for roles with `billing.view`. |
| Users | `/admin/users` | Search, filter (role, status, plan, coaching), sort, paginate. Detail drawer: account info, effective entitlements, subscription, complimentary grants, coach links, 30-day activity counts, recent account events, tickets and reports about the account, payments. Suspend/reactivate (signs out everywhere), change role (trainee/coach only), password-reset email, sign out all devices, delete (step-up + typed confirmation), grant/revoke access, CSV export (step-up). No passwords, tokens or health details are ever returned; minors' contact details are masked. |
| Coaches | `/admin/coaches` | Approve/reject applications, verify credentials, client counts and limits, open complaints, revoke privileges (ends all client links immediately), per-coach client-limit override. |
| Support | `/admin/support` | Tickets from the app (questions, bugs, feature requests, complaints, account reports), status/priority/assignee, replies (user is notified), internal notes (never shown to users), search and filters. |
| Subscriptions | `/admin/billing` | Display prices, optional Stripe price-ID overrides (validated against Stripe), features per tier (ads/AI), default client limit, coach-clients-get-AI, promotions (codes for temporary Plus/ad-free), active grants, scheduled cancellations, payments, cancel-at-period-end through Stripe. |
| Advertising | `/admin/ads` | Global switch, placements, refresh interval, daily impression cap, coached-trainee exclusion, non-personalised mode, eligibility counts, impressions/clicks, monthly network revenue entry. Minors and paid/ad-free users are always excluded. |
| AI center | `/admin/ai` | Providers (OpenAI, Anthropic, Gemini, Groq, OpenRouter — all via OpenAI-compatible endpoints), write-only encrypted keys, models, prices per 1M tokens, connection test, default + fallback order, global/per-user monthly limits, monthly budget, per-feature switches, usage by model/feature, failures, heaviest users, daily series. |
| Content | `/admin/content` | Exercise catalog edits layered over the bundled dataset (names, instructions EN/HE, category, difficulty, hide) with history and revert; shared food database with validation, duplicate detection, bulk CSV import (dry-run first); articles and FAQs with draft/publish/archive, preview, versions and restore; workout templates; EN/HE translation overrides with placeholder checks. |
| Notifications | `/admin/notifications` | Announcements to all users, coaches, independent trainees, coach-assigned trainees, Plus users or specific accounts; in-app and Expo push; send now, schedule or draft; live recipient preview and confirmation; read and push delivery statistics. |
| Features & config | `/admin/config` | Trainee/coach registration, coach approval requirement, beta flags, maintenance mode (EN/HE message), minimum/latest app version with optional/mandatory update notice. Every publish creates a version; one-click rollback; optimistic concurrency. |
| System | `/admin/system` | Health, DB connectivity/latency, uptime, memory, 24 h traffic per route, error rates, latency, failed requests (route/status/code only), scheduled job status with run-now, backups, storage, AI provider availability, configuration checks, versions. |
| Administrators | `/admin/admins` | Super Admin only: invite (one-time link), change role, disable/enable, reset password + MFA, end sessions. The last active Super Admin cannot be demoted or disabled; nobody can change their own role here. |
| Audit log | `/admin/audit` | Append-only record (DB triggers block UPDATE/DELETE) with administrator, action, resource, time, sanitised details and result (success/failure/denied); filters and CSV export (step-up). |
| My account | `/admin/account` | Change password (ends other sessions), regenerate recovery codes. |

English and Hebrew (full RTL), light and dark themes, collapsible sidebar, global search,
skeletons, empty and error states, confirmation dialogs and toasts throughout.

### App-side changes (backward compatible)

* Suspended users cannot sign in or use existing sessions; activity is tracked (throttled) for DAU/MAU/retention.
* Registration honours the remote switches; new coaches can require approval (`coachStatus`, default `APPROVED` so existing coaches are unaffected).
* Entitlements combine subscriptions with complimentary grants, remote tier rules, coach approval/limits and the minor rule. With no configuration and no grants, results are identical to before (covered by the existing tests).
* AI endpoints honour feature switches, monthly limits and budget; every model call is metered (tokens, estimated cost, latency, failure class — never content).
* Maintenance mode returns `503 maintenance` for app API calls except session lookup/sign-out.
* Users get **Help & support** (footer link → `/app/support`), a **promo code** box on the billing page, administrator announcements in the notification panel, and a pending/restricted notice for coaches.
* Ads respect placements, interval and daily cap and report aggregate impressions/clicks.
* Translation overrides and exercise edits apply to the web app (and therefore the mobile WebView).

## Routes

Pages: `/admin` (dashboard and sections `/admin/<section>`), `/admin/login`, `/admin/setup?token=…`.

Admin API (`/api/console/…`, all JSON, `x-nutra-admin: 1` header required on POST):
`auth/login`, `auth/mfa`, `auth/invite` (GET/POST), `auth/me`, `auth/logout`, `auth/step-up`,
`auth/password`, `auth/recovery-codes`, `dashboard`, `search`, `users`, `users/export`, `users/:id`,
`users/:id/status|role|reset-password|sessions/revoke|delete|grants`, `users/:id/grants/:grantId/revoke`,
`coaches`, `coaches/:id/status|verify|limit`, `billing`, `billing/plans`, `billing/promotions[/:id]`,
`billing/subscriptions/:userId/cancel`, `ai`, `ai/settings`, `ai/providers/:id[/test]`, `ads`,
`ads/settings`, `ads/revenue`, `content/exercises[/:id[/history|/revert]]`, `content/foods[/import|/:id/delete]`,
`content/items[/:id/history|/:id/restore]`, `content/translations[/:key]`, `content/templates[/:id/delete]`,
`announcements[/preview|/:id/send|/:id/cancel]`, `config`, `config/versions/:version`, `config/rollback`,
`config/flags`, `tickets[/:id[/reply]]`, `system`, `system/jobs/:job`, `admins[/:id[/reset|/sessions/revoke]]`,
`audit`, `audit/export`.

Public/app API added: `GET /api/config` (remote config + translation overrides; `?appVersion=` adds the update decision),
`GET /api/health`, `GET|POST /api/support`, `POST /api/promo`, `POST /api/ads/event`,
`POST /api/push/register`, `GET /api/content?type=FAQ|ARTICLE&lang=en|he`, `POST /api/jobs/run` (cron secret).

## Security architecture

* **Separate identities.** `AdminAccount` is a different table from `User`. No app role (including the legacy `ADMIN` role) can reach the console, and no app endpoint can create or promote an administrator. User role changes from the console are limited to trainee/coach.
* **No public registration, no hard-coded credentials.** The first Super Admin is provisioned from the server shell; others are invited by a Super Admin with a single-use, hashed, 72-hour link.
* **MFA is mandatory.** Sign-in is password → short-lived challenge (5 min, 5 attempts) → RFC 6238 TOTP (±30 s, replay-protected) or a single-use recovery code. TOTP seeds and AI keys are AES-256-GCM encrypted with `ADMIN_ENCRYPTION_KEY`.
* **Brute force.** Per-email (5/min) and global (60/min) limits, account lock for 15 min after 5 wrong passwords, constant-work password checks, generic errors.
* **Sessions.** Random 256-bit token, only its SHA-256 stored. Cookie `__Host-nutra_admin` (HttpOnly, Secure, SameSite=Strict, host-only). 30-minute idle timeout, 8-hour absolute lifetime; disabling an admin or changing their role ends their sessions.
* **Step-up.** Deleting users, exports, administrator management, plan/price changes, AI keys, config publish/rollback and backups require a TOTP re-entry within the last 10 minutes.
* **Authorization on every request.** Each endpoint declares its permission; the router checks host, session, expiry, account status, role permission and step-up before running it. Five roles with least privilege (see `src/lib/admin/rbac.ts`); only Super Admins hold `admins.manage` and `users.delete`.
* **CSRF.** SameSite=Strict cookie + Origin check + required custom header on every mutation.
* **Host isolation.** With `ADMIN_HOST` set, `/admin` and `/api/console` return 404 on every other host and the admin host serves nothing else (`robots.txt` disallows all). In production without `ADMIN_HOST` the console is off unless `ADMIN_ALLOW_SHARED_HOST=true`. The hidden URL is not relied upon.
* **Headers.** Admin responses: `X-Robots-Tag: noindex`, `Cache-Control: no-store`, strict CSP, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`; HSTS when served over HTTPS; optional HTTPS redirect (`ENFORCE_HTTPS=true`).
* **Data minimisation.** Account detail omits health/fitness data; exports contain only directory fields and mask minors' emails; metrics/failed-request logs store only route group, status, error code and duration; audit details are redacted for anything resembling a secret and size-bounded.
* **Audit.** Every mutation (success and failure), sensitive read and refused attempt is written to `AdminAuditLog`, which database triggers make append-only.
* **Supabase/RLS.** Not applicable: the project uses Prisma with SQLite and no client ever talks to the database directly; all access is through server-authorised handlers.

## Provisioning the initial Super Admin

On the server (or inside the app container) with the production environment loaded:

```sh
npm run db:migrate
npm run admin:provision -- --email owner@yourdomain.com --name "Owner"
# in Docker: docker compose -f deploy/compose.production.yaml --env-file deploy/.env.production \
#   exec app npm run admin:provision -- --email owner@yourdomain.com --name "Owner"
```

The script prints a one-time setup link (valid 72 h). Open it on the admin host, choose a
password (14+ chars, upper/lower case and a number), scan the QR code with an authenticator
app, confirm a code, and store the ten recovery codes offline. Then clear the terminal output.

* Lost authenticator or password: `npm run admin:provision -- --email … --reset` (server access required), or another Super Admin uses **Reset password & MFA**.
* A second Super Admin from the shell requires `--allow-additional`; prefer inviting from the console.
* The legacy `npm run admin:create` (app `User` with role `ADMIN`) still works for the old in-app admin page but grants no console access.

## Deployment (Hostinger VPS or any Docker host)

Nothing is purchased or provisioned automatically. You need a VPS with Docker, two DNS
records pointing at it (`app.example.com`, `admin.example.com`) and ports 80/443 open.

1. Clone the repository on the server and create the environment file:
   `cp deploy/env.production.example deploy/.env.production && chmod 600 deploy/.env.production`,
   then fill in the domains, `APP_URL`, `ADMIN_ENCRYPTION_KEY` (`openssl rand -hex 32`) and `CRON_SECRET` (`openssl rand -hex 24`).
2. `sh deploy/deploy.sh` — builds the image, takes a pre-deploy backup (after the first release), starts
   app + Caddy (automatic Let's Encrypt certificates for both domains) + scheduler, waits for `/api/health`
   and rolls back to the previous image if the new one never becomes healthy.
3. Provision the Super Admin (above).
4. Optional: restrict the admin host by IP in `deploy/Caddyfile`.

The scheduler calls `/api/jobs/run` every 5 minutes (scheduled announcements, metrics, cleanup) and
creates a `VACUUM INTO` backup nightly at 03:00 UTC into the data volume (`backups/`, 14 kept). Copy
backups off the server (e.g. `rclone`/`restic` from the volume) — an on-volume backup alone is not a
disaster-recovery plan. To restore: stop the app, replace `/data/nutri.db` with the chosen backup, start it.

**CI/CD.** `.github/workflows/verify.yml` type-checks, runs unit tests, builds and runs the API,
admin and browser suites on every push. `.github/workflows/deploy.yml` deploys over SSH only when
run manually and only if the `VPS_HOST`, `VPS_USER` and `VPS_SSH_KEY` secrets exist. Use separate
servers or compose projects (and separate `.env.production` files, keys and databases) for
staging and production.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `ADMIN_HOST` | production | Admin hostname; console only answers there. |
| `ADMIN_ENCRYPTION_KEY` | production | 32-byte key for TOTP seeds and AI keys. Keep it backed up; rotating it invalidates enrolments and saved keys. |
| `CRON_SECRET` | for jobs | 32+ chars; enables `/api/jobs/run`. |
| `APP_URL` | yes | Public HTTPS origin (password links, origin checks). |
| `ENFORCE_HTTPS` | recommended | `true` behind the TLS proxy. |
| `ADMIN_ALLOW_SHARED_HOST` | no | Only to serve the console on the app host in production (not recommended). |
| `BACKUP_DIR`, `BACKUP_KEEP` | no | Backup location and retention. |
| `EXPO_ACCESS_TOKEN` | no | Only if Expo enhanced push security is on. |
| `GIT_SHA`, `APP_ENV` | no | Shown on the System page. |
| Existing: `DATABASE_URL`, `OPENAI_*`, `RESEND_API_KEY`, `EMAIL_FROM`, `STRIPE_*` | as before | Unchanged. |

## Integrations that need manual setup

* **Stripe:** keys, webhook and prices (see `BILLING.md`). Price-ID overrides in the console are verified against Stripe; changing a price affects new checkouts only.
* **App Store / Google Play:** the mobile app does not sell in-app purchases; if you add them, use StoreKit / Play Billing and map their server notifications to entitlements. Console grants are complimentary access and never replace store billing.
* **Push notifications:** server delivery via Expo is implemented (`/api/push/register`, announcements with push). The mobile app must register its token after sign-in, which needs an EAS project ID:
  ```ts
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await fetch(`${origin}/api/push/register`, { method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, platform: Platform.OS }) });
  ```
* **Ad revenue:** AdMob/AdSense do not push revenue to the app; enter monthly figures on the Advertising page (or automate via the AdMob Reporting API later).
* **Email (Resend):** needed for console-triggered password resets.
* **AI providers:** paste keys in the AI center (or keep `OPENAI_*`); verify the model names and prices for your account.

## Testing

* `npm test` — unit tests (TOTP vectors, encryption, recovery codes, RBAC matrix, config fallbacks, entitlement rules, audit redaction, CSV injection, localisation of both dictionaries).
* `npm run test:admin` — 16 integration tests against a running server: anonymous/app-user/cross-site denial, password + TOTP, replay and lockout, role enforcement and denial auditing, idle/expired/disabled sessions, step-up, suspension and grants reflected in the app, coach approval and revocation, dashboard figures vs. database, config versions/maintenance/rollback, write-only AI keys, announcement targeting and confirmation, support privacy, append-only audit log, administrator invitations, cron secret, health.
* `tests/browser/admin-console.spec.ts` — real browser: server-gated direct URL, TOTP sign-in, sections, Hebrew RTL, dark mode, phone layout, sign-out.

## Known limitations

* SQLite and a single app instance (as before). Metrics are buffered in memory and flushed every 15 s; a crash can lose that window.
* Exercise media files remain a build-time asset pipeline (`catalog:*` scripts); the console edits text, category, difficulty and visibility, and previews media, but does not upload new videos. New custom exercises are not created from the console.
* "Active users" counts users seen since this release (activity tracking starts now); retention needs 7+ days of data.
* MRR is an estimate (active subscriptions × configured display price); collected revenue comes from Stripe invoices.
* Push requires the mobile token registration above. Delivery statistics are Expo ticket acceptance, not device receipt.
* The daily ad cap is enforced per device in the web app; the native AdMob banner follows the existing mobile policy.
* Audit log entries cannot be deleted by design; retention pruning needs a reviewed migration.
