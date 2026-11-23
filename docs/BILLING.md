# Plans

| Plan  | Stored tier | Price     | Ads | AI                       | Clients  |
| ----- | ----------- | --------- | --- | ------------------------ | -------- |
| Free  | `FREE`      | $0        | Yes | Only with a paying coach | —        |
| Plus  | `PREMIUM`   | $5/month  | No  | Only with a paying coach | —        |
| Coach | `COACH`     | $30/month | No  | Yes                      | Up to 10 |

Rules live in `src/lib/plans.ts` and are returned to the client as `state.entitlements`. AI (`/api/ai`, `/api/ai/plan`) is allowed for coaches on an active Coach plan and for any user with an accepted link to such a coach; otherwise it returns `403 aiPlanRequired`. Coaches need an active Coach plan to invite clients (`403 coachPlanRequired`). Coaches who already have more than 10 clients keep them but cannot invite more. When billing is not configured (development), coach accounts are treated as paid so coaching and AI stay usable. Displayed prices come from `PLAN_PRICE_USD`, and the Stripe prices must match them. Ads are an `AdSlot` house ad (Upgrade to Plus) until an ad network is connected in `src/components/ad-slot.tsx`.

# Stripe adapter

Billing is disabled by default. The official Stripe SDK implements hosted subscription checkout, customer billing portal (including provider-configured cancellation), raw-body signature verification, a timestamp tolerance and event deduplication in a database transaction. Only verified subscription webhooks update entitlement records; the success URL does not grant access. Canonical provider subscription/invoice retrieval reduces stale-event effects. Prices come only from server environment IDs, not request amounts. No card details enter Nutra+.

## Configuration and test-mode validation

- Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PREMIUM` ($5/month Plus), `STRIPE_PRICE_COACH` ($30/month Coach) and a trusted `APP_URL`.
- Create recurring prices in your Stripe test environment. The two price IDs should be distinct. Only coach accounts can purchase the coach tier.
- Configure the customer billing portal in Stripe, including permitted cancellation and subscription changes. Portal return URL is the configured app origin.
- Forward webhooks to `POST /api/webhooks/stripe`. Subscribe to `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` and `invoice.payment_failed`.
- Verify checkout, duplicate-event delivery, failed payment, renewal, cancellation, invoice records and event ordering in Stripe test mode before using live credentials.

`POST /api/billing/checkout` accepts `{tier:"PREMIUM"|"COACH"}` and returns a hosted Checkout URL only on provider success. `POST /api/billing/portal` returns a billing portal session for the authenticated user's existing customer. `GET /api/billing/info` returns only that user's invoice records. These endpoints require a session and same-origin mutation checks. Invoice amounts are stored in the currency's minor units; current UI currency display assumes two decimal digits and must be adjusted before enabling zero/three-decimal currency prices.

Important limitations: provider round trips, renewals and portal cancellation have not been tested with live credentials here. Unit tests validate SDK signature handling and status mapping; the default disabled state is tested by API checks. Annual/monthly plan selection, trials, proration UX, tax treatment, refunds, revenue analytics and coach-to-client payments remain pending. Do not enable paid plans commercially until the advertised premium value, applicable policies and all provider test scenarios have been verified. Account deletion is blocked while a paid subscription is locally active, so users must manage cancellation first.

Implementation references: [Checkout session creation](https://docs.stripe.com/api/checkout/sessions/create), [webhook handling](https://docs.stripe.com/events/manage-webhook-endpoints), [subscription lifecycle](https://docs.stripe.com/billing/subscriptions/overview). No real payment was created during development.
