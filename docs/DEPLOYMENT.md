# Deployment and operations

## Single-instance container

The included Docker configuration builds on Node 24, generates Prisma, builds Next with Webpack, migrates a persistent SQLite database and seeds only the public original libraries in production. It does not require external credentials for workout, diary or coaching workflows.

```sh
docker compose up --build -d
```

The application listens on port 3000. Put a TLS reverse proxy in front, set `APP_URL` to its trusted public HTTPS origin, set `DEMO_ENABLED=false`, and keep the database volume private. Production session cookies use Secure. Start with an empty production database; never copy the development demo database. Docker was not available in the authoring environment, so this configuration must be executed and verified before rollout.

Only one application instance should write this SQLite volume. Do not use ephemeral serverless disk, shared network filesystem SQLite or multiple replicas. For horizontal scaling, migrate the Prisma datasource and all migrations to PostgreSQL, add relevant transactional constraints and test concurrent scheduling/entitlements. Do not simply run SQLite migrations against PostgreSQL.

## Credentials

`APP_URL` is required for password reset links and trusted-origin handling. `OPENAI_API_KEY` and `OPENAI_MODEL` are server-only and optional. `RESEND_API_KEY` and `EMAIL_FROM` activate the email adapter; verify the sender domain first. Never prefix secrets with `NEXT_PUBLIC_`. Stripe requires the complete set of environment values and provider test scenarios in `BILLING.md`; WhatsApp and health provider implementations are pending.

## Administrator bootstrap

The administration console uses separate administrator accounts with mandatory two-step verification. Provision the first Super Admin from the server shell with `npm run admin:provision -- --email … --name …`, which prints a one-time setup link. See [ADMIN.md](ADMIN.md) for the console, security model, production stack (`deploy/`), backups and environment variables. The legacy `npm run admin:create` only creates an app user with the old `ADMIN` role and grants no console access.

## CI verification

GitHub Actions installs the lockfile, initializes a disposable development database, type-checks, runs unit tests, builds, starts a development server, exercises API behavior and runs Chromium browser tests. Test artifacts are uploaded for review. The workflow validates source but does not deploy or publish anything.

## Retention and backups

Current sessions expire after seven days and password resets after 30 minutes. Expired records cannot authenticate but are not currently pruned automatically. Run a controlled maintenance job before a long-lived production deployment to prune expired sessions/reset/rate-limit rows. AI history remains until account deletion; a configurable retention policy is pending. Account deletion cascades personal records and related messages, clears assigned-client references, and deletes the user's audit events. Other participants must export shared conversations before deletion if retention is needed.

Back up the database using SQLite's online backup API or stop the app and make a consistent copy of the complete database files. Store backups encrypted, restrict access and test a restoration into a separate environment. Apply a documented deletion policy to backups too. No backup service is provisioned here.

## Before real users

Finish the partial/pending workflows in `FEATURES.md`, validate consent/legal requirements, test password recovery against the configured email provider, review AI output behavior with representative safety cases, run dependency and penetration tests, verify TLS, disk encryption, restore operations and observability, and establish incident response. This implementation has not been certified for any privacy regime. External integrations must be tested with official test environments and signature/idempotency verification where applicable.
