# Nutra+ JSON API

Base path: `/api/`. All mutations use POST with `Content-Type: application/json`. Authenticated routes require the `nutri_session` HttpOnly cookie. Foreign browser origins are rejected on mutation. Responses use localized error keys; the client translates them. Zod strips unknown object keys and checks enums, lengths and numeric ranges. The API runs on Node, never at the edge.

## Authentication

- `POST auth/register`: `{name,email,password,role,language}`. Roles allowed: `INDEPENDENT`, `COACH`. Password minimum 10 characters. Creates profile, free subscription and session.
- `POST auth/login`: `{email,password}`.
- `POST auth/logout`: `{}`. Revokes the current session.
- `GET auth/me`: current public identity, profile, subscription and branding, or `user:null`.
- `POST auth/demo`: development-only seeded demo login.
- `POST auth/recover`: `{email}`. Sends a reset link only through a configured email adapter. Response does not reveal account existence.
- `POST auth/reset`: `{token,password}`. Consumes a hashed single-use token; revokes existing sessions.

## Reads

- `GET exercises/:exerciseId/demonstration`: authenticated response `{provider: "smartworkout", media: {mp4, poster, gif} | null}`. Posters and prebuilt looping GIFs are local static assets; MP4 URLs refer to indexed hosted media. `demonstration=video` filters the catalog to matched animations, which sort first. Unmatched exercises return null media; existing catalog IDs and Hebrew translations remain stable.
- `GET activity?date=YYYY-MM-DD`: current account's step total and aerobic activities for a date. No coach/client override. `POST activity` supports `action:add` with `{kind,minutes,distanceKm?,date,externalId?}`, `action:sync` with `{source,date,steps,activities}`, `action:delete` with an activity `id`, and `action:disconnect` to remove imported fitness data. Sync sources are `apple-health` and `health-connect`; steps may be null for partial permissions. Totals replace by user/date, imported workouts upsert by user/source/external ID. A native sync also sends `expectedUserId` to reject a session/account change. All writes reject foreign origins, require authentication and are rate-limited. Account export includes these records; user deletion cascades to them.

- `GET state?date=YYYY-MM-DD`: current workspace. Optional `userId` is accepted only for self or an accepted coach-client relationship. Health arrays refer to the target; account identity, appointments and messaging remain those of the caller. Coach-only relationship notes are redacted from client responses. Returns up to 150 workout sessions, 500 progress entries and 300 messages. Pagination is a pending scale requirement.
- `GET library`: public original exercises/foods plus the current user's custom foods.
- `GET export`: downloadable JSON containing the user's own account, profile, programs, sets, diary foods, recipes, progress, water, relationships, appointments and conversations. Does not include password/session/reset secrets. Coach export does not bulk-export client records.
- `GET admin`: admin-only account directory, flags and audit event metadata. Admin does not imply unrestricted access to personal health records.

## Workouts

- `POST programs/save`: `{id?,name,description,weeks,days,template,assignedClientId?,exercises:[{exerciseId,sets,reps,rest,weight,group}]}`. Days are comma-separated weekday indexes, Sunday=0. Load is stored in kg. Program owners alone can edit; assignments require accepted coaching consent.
- `POST programs/generate`: `{}`. Builds a general editable routine using completed onboarding preferences. No AI call.
- `POST programs/delete`: `{id}`. Owner only; historical sessions remain, with their program reference cleared.
- `POST workouts/start`: `{programId}`. Creates sets transactionally or returns an already-open session. Program must be owned or assigned by an accepted coach.
- `POST workouts/update`: `{id,status?,notes?,set?:{id,reps,weight,completed}}`. Owner only. Finished sessions cannot be edited. Paused sessions reject set logging. Pause/resume accumulates active seconds; rest periods remain part of session time.

## Nutrition and progress

- `POST meals/add`: `{foodId,grams,meal,date}`. Meal is `breakfast|lunch|dinner|snack`. Food must be public or owned.
- `POST meals/delete`: `{id}`. Owner-scoped deletion.
- `POST meals/copy`: `{from,to}`. Explicitly adds entries; does not overwrite destination entries.
- `POST water`: `{ml,date}`. Per-entry range 50–1000 ml; no forced daily target.
- `POST foods`: `{nameEn,nameHe,calories,protein,carbs,fat,fiber}`. All values per 100 g, explicitly user-estimated.
- `POST recipes`: `{name,instructions,servings,ingredients:[{foodId,grams}]}`.
- `POST meal-plans`: `{name,content,assignedClientId}`. Coach-only; client assignment requires consent. Content is plain text, never HTML.
- `POST meal-plans/delete`: `{id}`. Owner only; the plan's items and completion checks are removed with it, and an assigned client loses access.
- `POST progress`: `{kind,value,unit,date,note}`. Kind: `energy|sleep|distance|measurement`. Optional user-chosen measurements, no generated weight-loss targets.

## Coaching and communication

- `POST clients/invite`: `{email}`. Coach-only. Invites an existing account within tier capacity. No external email delivery is simulated.
- `POST clients/respond`: `{id,accept}`. Invited client only; enables or declines sharing.
- `POST clients/update`: `{id,notes,tags}`. Relationship's coach only, active relationships only.
- `POST clients/revoke`: `{id}`. Either participant can end sharing immediately.
- `POST messages`: `{recipientId,body}`. Accepted coach-client relationship required. Plain text; no unsolicited external delivery.
- `POST messages/read`: `{senderId}`. Marks only messages addressed to the caller.
- `POST notifications/read`: `{}`. Marks only the caller's notifications.
- `POST appointments`: `{title,guestId,startsAt,duration}`. UTC ISO `startsAt`, duration 15–180 minutes, future only. Guest must be a related coach/client. Checks both participants' booked intervals in a database transaction; adjacency is allowed.
- `POST appointments/update`: `{id,status,notes?}`. Participants may cancel; owner marks attendance.
- `POST branding`: `{businessName,color,welcome}`. Coach only; color must be a six-digit hex value.

## Preferences, privacy and AI

- `POST preferences`: `{language?,theme?}`.
- `POST profile`: complete editable onboarding form. Includes goal, experience, equipment, frequency, duration, dietary, limitations, units, IANA timezone, adult, aiConsent, reminders and onboarded. Language is `en|he`; theme `light|dark`.
- `POST ai`: `{mode,prompt}`. Mode `fitness|nutrition|copilot`; copilot is coach-only. Adult and consent gates, provider availability and a lower AI rate limit apply. No program or meal assignment is modified.
- `POST account/delete`: `{password}`. Rechecks password, deletes personal records with cascading foreign keys, revokes sessions. Demo account is protected. Program assignments are cleared. Messages with both participants are removed on deletion; exports should precede deletion if a copy is wanted.
- `POST admin/flag`: `{key:"marketplace",enabled}`. Admin only. Flag is an architecture placeholder, not an implemented public marketplace.

## Errors

400 validation/invalid transition; 401 unauthenticated or invalid credentials; 403 ownership/role/consent failure; 404 missing record; 409 email conflict or appointment overlap; 429 rate limit; 503 provider unavailable. Unexpected errors emit a structured event with error type only and return `serverError`. No raw Prisma query, password, provider response or health payload is returned in errors.

## Billing

Credential-gated Stripe hosted checkout, customer billing portal, invoice records and raw-body signature-verified webhooks have dedicated routes. See `BILLING.md` for exact routes, events and configuration. No card data is stored. Live provider round trips are unverified.

## Not implemented

No external messaging delivery, food-photo upload, health import, file storage or calendar-sync endpoint is exposed. These require real provider adapters and integration tests before enabling.
