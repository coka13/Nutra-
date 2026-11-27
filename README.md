# Fitura+

The exercise library opens **1,086 exercises with demonstrations**, covering all **1,029 SmartWorkout animations**, organized by individual muscle groups: biceps, triceps, chest, lats, upper/lower back, shoulders, quads, hamstrings, glutes, calves and more. It includes preacher-bench, machine, barbell, dumbbell and cable variations. Search for “preacher chair” or “preacher bench” to find preacher curls. The workout builder offers the same demonstrated catalog and saves selected exercises automatically; no manual import is required.

Demonstrations and thumbnails use one provider: [SmartWorkout](https://smartworkout.app/en/exercise-library). The full 1,029-entry animation index is exposed through matched legacy exercises and new source-native entries with instructions and bundled Hebrew translations. Matching handles name word order, plurals and equivalent spellings while preserving equipment, grip and variation qualifiers. Every new library/builder choice has a demonstration. Unsupported exercises are excluded from library responses, saved routine displays, generated workouts and newly started sessions. Saving or importing an unsupported exercise is rejected by the server. Finished workout history remains intact. Saved exercise names are resolved by the demonstration endpoint as well as their IDs. Animations loop, provide play/pause controls, pause in hidden tabs and honor reduced motion; playback errors offer retry. No source captions or links appear beneath demonstrations.

Videos and posters load directly from SmartWorkout and require internet access and continued upstream availability. This is a public-media integration, not a claim that SmartWorkout offers an open-license redistributable database. Old bundled media and notices remain in the repository but are no longer displayed. All 2,066 existing names and instructions retain their bundled Hebrew translations and stable IDs.

**Steps & aerobics** supports daily step totals, manual aerobic logs (type, duration and optional distance), and explicit fitness sync from Apple Health/Android Health Connect in a newly built phone app. See [mobile setup and limitations](mobile/README.md#steps-and-aerobic-activity). Imported data is account-scoped, repeat syncs do not add the daily steps again, and account export/deletion includes these records.

Run `npm run catalog:smartworkout` to refresh the public animation URL index, then `npm run catalog:thumbnails` and `npm run catalog:gifs` to prepare the local previews and looping animations before deployment. The GIF build is resumable and uses the light video variants; no runtime conversion is needed for indexed exercises. The first catalog page is supplied with the app shell, its animations load in the background, and the library preloads the next page. `npm run catalog:translate` rebuilds changed public catalog translations and reapplies the terminology glossary; runtime translation does not require a network call. Legacy media restore scripts remain available for archival assets.

The Android and iPhone app lives in [mobile](mobile/README.md). Start the Fitura+ backend and Expo preview to use it on a phone. The mobile app shares accounts, workouts and coaching records with this service.

A bilingual fitness and coaching application built from an empty repository. Next.js 16 App Router, React 19, TypeScript, Prisma, SQLite, Zod, Lucide and Recharts. All shipped tracking and coaching workflows use the database; the demo is explicitly labeled sample data.

## Run locally

Use Node.js 24 LTS and npm. From this directory:

```powershell
Copy-Item .env.example .env
npm ci
npm run setup
npm run dev
```

Open [Fitura+](http://localhost:3000). Choose **Explore the demo** on the sign-in page, or register an independent or coach account. New users complete onboarding. The guided routine generator creates an editable template using your experience, equipment, frequency and session length. This is deterministic programming logic, not AI inference or individualized medical advice.

Development-only sample accounts:

- Personal: `alex@nutri.local` / `NutriDemo2026!`
- Coach: `coach@nutri.local` / `NutriCoach2026!`

The one-click demo works everywhere. In development it signs in to the seeded shared `alex@nutri.local` account (seeded only with `DEMO_ENABLED=true` outside production). In production every visitor gets a private, temporary demo account with sample records, deleted after 24 hours (`src/lib/demo.ts`); set `DEMO_ENABLED=false` to turn the demo off. Never deploy a database copied from development.

SQLite data lives at `prisma/dev.db` by default and survives application restarts. Do not delete it to restart the app. The schema and migrations are committed; the local database and credentials are ignored. `npm run db:migrate` creates the database file if necessary and applies migrations. Stop the running server before `prisma generate` on Windows because the Prisma DLL may be locked.

## What works

- Registration, sign-in/out, password hashing, expiring database sessions, settings and onboarding.
- English/Hebrew UI and RTL layouts, persisted language and light/dark theme, responsive navigation.
- Bilingual exercise library with equipment and muscle filters, technique demonstrations, coaching cues and alternatives. Demonstrations use hosted SmartWorkout animations.
- Workout creation/editing, drag ordering plus keyboard-accessible reorder buttons, sets/reps/rest/load, groups, templates, duplication, assignments and guided schedules.
- Live workout and rest clocks, automatic rest and exercise advancement, weight/reps logging, workout summaries, and per-exercise personal records and charts. Rest alerts are scheduled locally by the mobile app.
- Food diary with gram calculations, custom foods, day selection, copying yesterday, water logs, recipes and coach meal plans and dated menus with remote updates and template duplication.
- Progress entries, strength-volume charts, check-in charts, consistency calendar and personal JSON export.
- Coach invitations, explicit client consent/revocation, client search/status filters, private coaching notes/tags, live workout and adherence views, consent-controlled progress photos, program assignment and messaging with read indicators.
- Appointment creation, UTC persistence, localized time-zone display, transaction-based conflict checks, cancellations and attendance.
- Server-side text AI adapter with consent/adult gates, model configuration, rate limits, translated prompts and no automatic record changes. Requires a provider key; live provider behavior has not been tested here.
- Coach branding configuration/preview, in-app notifications, free subscription records, server-enforced client capacity, admin user/flag read access, account deletion and audit events.

See [the precise feature report](docs/FEATURES.md) for partial and pending requirements. This is a runnable foundation with substantial end-to-end workflows, **not the fully complete commercial platform in the master brief**.

## Validation

```powershell
npm test
npm run typecheck
npm run build
# With npm run dev running on port 3000:
npm run test:api
npm run test:e2e
```

The browser suite uses installed Microsoft Edge on Windows and Playwright Chromium on Linux. On Linux run `npx playwright install --with-deps chromium` first. Test screenshots go to `test-results/`. Tests create and remove separate test accounts; the screenshot test also uses the labeled demo account. These tests are intended for development or a disposable CI database, never a live production database.

## External services


- `OPENAI_API_KEY`: optional server-only AI text provider. `OPENAI_MODEL` defaults to `gpt-4.1-mini`. Users must be adults and explicitly opt in. No history is sent automatically; only the entered prompt and the safety instruction are sent. Both prompt and response are stored in the user's private AI interaction history.
- `RESEND_API_KEY` and `EMAIL_FROM`: optional password reset email via Resend. Set `APP_URL` to the trusted canonical origin. Without these values, recovery returns a clear unavailable error and never claims delivery. With them, it uses a single-use hashed reset token expiring in 30 minutes. Email delivery has not been tested against a live provider.
- Food database: a local database of ~12,000 foods with Hebrew and English names, one food per name (no duplicates; generic foods are preferred and listed before branded products). Sources: **Tzameret**, the Israel Ministry of Health national food composition database (data.gov.il, open licence — Israeli generic foods and cooked dishes such as shawarma, shakshuka and falafel, native Hebrew names), USDA FoodData Central Foundation + FNDDS foods (public domain, machine-translated names) and products sold in Israel from Open Food Facts (ODbL; attribution shown in the picker; derived data must stay under ODbL). It is built **once** with `npm run catalog:foods` (downloads, keeps plausible per-100 g values, machine-translates names, writes `src/data/food-database.json`; resumable) and loaded with `npm run db:foods` (offline, idempotent, part of `npm run setup`). Searching in the app queries only this local database — no external API calls at runtime. CalorieKing data requires a commercial license and is not included.
- Meal plans contain foods with grams per meal (breakfast/lunch/dinner/snacks) plus optional notes, apply to the entire week, chosen weekdays or one date, and can be assigned by a coach to an active client. Clients can log a whole plan to their diary in one step.
- `DATABASE_URL`: development SQLite connection. The included container uses `file:/data/nutri.db`.
- Stripe: optional official SDK adapter for hosted checkout, billing portal, subscription lifecycle and invoice records through verified idempotent webhooks. Configure the five billing variables described in [billing setup](docs/BILLING.md). Live/test-mode provider round trips still require credentials and verification. Paid access is never granted by the return URL alone.
- WhatsApp Business, external food databases/barcodes, image recognition, push, calendar synchronization, health/wearables and object storage do not yet have provider implementations. Their UI states do not claim successful delivery or recognition.

The original food seed records are illustrative **estimates per 100 g**, not verified branded Israeli products. Always check labels. No proprietary NutriCal data, media or code is included.

## Deployment

Read [deployment instructions](docs/DEPLOYMENT.md), [architecture](docs/ARCHITECTURE.md), [API documentation](docs/API.md), and [feature scope](docs/FEATURES.md). A Dockerfile, Compose volume and GitHub Actions verification workflow are included. Docker execution and hosted deployment have not been verified in this environment.
