# Project Playbook — Proximity Social / NearMe

Real-Time Nearby Social Discovery app. Backend = Node + TypeScript + Express + Socket.IO + Prisma/PostgreSQL + Redis. Frontend = Expo / React Native.

---

## What's in the repo

- **`backend/`** — REST + Socket.IO API (port **4000**), Prisma → PostgreSQL, Redis for geo/OTP/presence.
- **`frontend/`** — Expo / React Native client.
- **Two docker-compose files exist and they conflict:**
  - `backend/docker-compose.yml` → DB name `proximity_social` ✅ **USE THIS ONE** (matches `backend/.env.example`).
  - root `docker-compose.yml` → DB name `nearme` ❌ mismatched, points at a non-existent `./backend/.env`. Ignore for now.
- **`backend/.env` does NOT ship in the repo** — create it from `.env.example` (most important first step).

---

## Option A — Everything in Docker (simplest, one command)

```bash
cd backend
cp .env.example .env            # one time
docker compose up --build       # builds + runs postgres, redis, and api together
```

- The `api` container auto-runs `prisma migrate deploy` then starts the server.
- API live at http://localhost:4000 · Postgres on 5432 · Redis on 6379.
- Stop: `Ctrl+C`. Tear down: `docker compose down` (add `-v` to also wipe the DB volume).

---

## Option B — DB/Redis in Docker, backend live-reloading locally (best for dev)

```bash
cd backend
cp .env.example .env            # one time

docker compose up -d postgres redis   # start only Postgres + Redis

npm install                     # one time
npm run prisma:generate         # one time / after schema changes
npm run prisma:migrate          # creates tables — name the migration e.g. "init"

npm run dev                     # API with hot reload → http://localhost:4000
```

---

## Frontend (Expo)

cd frontend
npx expo run:android   # first time: builds + installs
# subsequent runs:
npx expo start         # metro bundler only, uses the installed native shell


export ANDROID_HOME=$HOME/Library/Android/sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/emulator

 source ~/.zshrc 
 
```bash
cd android          
./gradlew clean
cd ..
npx expo run:android
```

```bash
cd frontend
npm install
npx expo run:android


adb -s emulator-5554 install -r android/app/build/outputs/apk/debug/app-debug.apk
npm start                       # press i (iOS), a (Android), or w (web)
```

---

## Connection links / credentials

| Thing | Value |
|---|---|
| API base URL | `http://localhost:4000` |
| API prefix | `/api/v1` (e.g. `http://localhost:4000/api/v1/auth/request-otp`) |
| WebSocket | `ws://localhost:4000` (Socket.IO) |
| Postgres | `postgresql://postgres:postgres@localhost:5432/proximity_social?schema=public` |
| Redis | `redis://localhost:6379` |
| OTP in dev | `OTP_DEV_RETURN=true` → OTP code returned in the API response, no SMS needed |

⚠️ **Frontend networking gotcha:** `frontend/.env` uses `EXPO_PUBLIC_API_URL=http://localhost:4000`. `localhost` works on the iOS simulator and web, but **NOT on a physical phone or Android emulator**. Use your Mac's LAN IP instead:
```bash
ipconfig getifaddr en0          # e.g. 192.168.1.20
# then set EXPO_PUBLIC_API_URL=http://192.168.1.20:4000 in frontend/.env
```

---

## ⚠️ Setup gotchas (discovered during first run)

### 1. Migrations are broken on a fresh DB — use `db push` instead
`npm run prisma:migrate` / `prisma:deploy` **fails** with `type "BodyType" does not exist`.
The migrations in `prisma/migrations/` were written as incremental `ALTER TYPE` / `ALTER TABLE`
edits against a baseline that was never captured as an initial migration. On an empty database
there's nothing to alter.

**Fix for local dev** — sync the DB directly from `schema.prisma` (the real source of truth):
```bash
cd backend
npx prisma db push --force-reset --skip-generate    # drops + recreates schema, no migrations
```
`schema.prisma` has all 29 models / 24 enums, so this gives you the complete, correct schema.
(`--force-reset` wipes data — fine for local dev. To fix the migration history properly later,
generate a fresh baseline migration with `prisma migrate diff` / `migrate dev`.)

### 2. Extra env vars required at startup (not in `.env.example`)
`src/config/env.ts` hard-requires these or the server exits with
`FATAL: Missing required env vars`:
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`,
`GCS_BUCKET_NAME`, `GCS_SERVICE_ACCOUNT_KEY`.
They're only **presence-checked**, so dev placeholders let the server boot (already appended to
`backend/.env`). Real keys are only needed for billing (Razorpay), video calls (Agora), and
media upload (GCS) — auth, grid, intro requests, and chat all work without them.

---

## Useful backend npm scripts

| Script | Does |
|---|---|
| `npm run dev` | Hot-reload dev server (ts-node-dev) |
| `npm run build` | Compile TS → `dist/` |
| `npm start` | Run compiled `dist/index.js` |
| `npm run prisma:generate` | Regenerate Prisma client |
| `npm run prisma:migrate` | Create + apply a dev migration |
| `npm run prisma:deploy` | Apply existing migrations (prod / CI) |
| `npm run db:seed` | Load 8 demo personas + inbox/taps/views (see below) |
| `npm run lint` | ESLint |

---

## Common Docker commands

```bash
docker compose ps                       # status of containers
docker compose logs -f api              # tail API logs
docker compose logs -f postgres redis   # tail DB/Redis logs
docker compose down                     # stop + remove containers
docker compose down -v                  # also delete the DB volume (fresh start)
docker exec -it proximity_postgres psql -U postgres -d proximity_social   # psql shell
docker exec -it proximity_redis redis-cli                                 # redis shell
```

---

## Core API flows (from backend/README.md)

| Domain | Routes |
| --- | --- |
| Auth (phone + OTP) | `POST /api/v1/auth/request-otp`, `/verify-otp`, `/refresh`, `/logout`, `GET /me` |
| Profile & photos | `PATCH /api/v1/me`, `POST /api/v1/me/photos`, `POST /api/v1/me/location` |
| Safety toggles | `PATCH /api/v1/me/settings` (verifiedOnly, proximityShrink, stealthMode) |
| Live grid | `GET /api/v1/grid?lat&lng&radius` |
| Intro requests | `POST /api/v1/requests`, `GET /requests/incoming`, `/:id/accept`, `/:id/ignore` |
| Chat (E2E) | `GET /api/v1/conversations`, `/:id/messages`, `POST .../messages` |
| Billing | `GET /api/v1/billing/plans`, `/subscribe`, `/credits/purchase`, `/boosts`, `/verify` |
| Safety | `POST /api/v1/safety/block`, `/report` |

Full machine-readable contract: `backend-spec.json`.

---

## Demo seed data (feature testing)

After Postgres + Redis are up and the schema exists (`npx prisma db push`):

```bash
cd backend
npm run db:seed
```

This creates **8 profiles** near Mumbai (`lat=19.076`, `lng=72.8777`), all within ~2 km:

| Email | Persona | Plan | Gender | Use for |
|---|---|---|---|---|
| `demo-you-male@nearme.dev` | Rahul | Gold | Male | **Your login** — inbox, calls, who-viewed-me |
| `demo-you-female@nearme.dev` | Kavya | Platinum | Female | **Your login** — AI features, albums, travel |
| `arjun@nearme.dev` | Arjun | Free | Male | Grid, free-tier cap, pending chat |
| `priya@nearme.dev` | Priya | Premium | Female | Active inbox w/ Rahul, private album grant |
| `rohan@nearme.dev` | Rohan | Gold | Male | Boosted grid card, archived chat w/ Kavya |
| `meera@nearme.dev` | Meera | Free | Female | Pending request folder |
| `vikram@nearme.dev` | Vikram | Platinum | Male | Incognito, block (blocked Arjun) |
| `ananya@nearme.dev` | Ananya | Premium | Female | College verified, taps |

### Demo login — email + password (no Firebase, no AWS verification)

**All 8 accounts use the same password:** `NearMeDemo1!`

In the app: open **Log In**, enter any `@nearme.dev` email + that password. The app skips Firebase and logs you straight into the seeded profile (already verified — no selfie/AWS step needed).

| Email | Password |
|---|---|
| `demo-you-male@nearme.dev` | `NearMeDemo1!` |
| `demo-you-female@nearme.dev` | `NearMeDemo1!` |
| `arjun@nearme.dev` | `NearMeDemo1!` |
| `priya@nearme.dev` | `NearMeDemo1!` |
| `rohan@nearme.dev` | `NearMeDemo1!` |
| `meera@nearme.dev` | `NearMeDemo1!` |
| `vikram@nearme.dev` | `NearMeDemo1!` |
| `ananya@nearme.dev` | `NearMeDemo1!` |

Override the password in `backend/.env`: `DEV_SEED_PASSWORD=your-password`

For Docker local dev, ensure `DEV_LOGIN_ENABLED=true` is set (already in `backend/docker-compose.yml`). Real production deploys must leave it unset/false.

**curl test:**

```bash
curl -s -X POST http://localhost:4000/api/v1/auth/dev-login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo-you-male@nearme.dev","password":"NearMeDemo1!"}' | jq .
```

Set your app location to Mumbai (`lat=19.076`, `lng=72.8777`) to see everyone on the grid.

Re-run `npm run db:seed` any time to reset demo data (wipes and recreates seed users only).

### Photo verification (current behavior)

1. **Content moderation** — `moderateImage()` checks AWS Rekognition labels when `AWS_ACCESS_KEY_ID` is set; otherwise dev allows all images.
2. **AI verification** — `aiVerification.verifyPhoto()` / `verifyFace()` are **stubs** that auto-approve any submitted media (score ~0.95). Profile photo URLs are now passed in for future face-matching, but matching is not wired yet.
3. **Full verified badge** — `isVerified = true` when `(phoneVerified OR emailVerified) AND faceVerified`. Photo verification sets `photoVerified` separately.

Production TODO: wire AWS Rekognition / Azure Face / FaceTec for liveness + face-match against profile photos.


| Result  | UPI ID             |
| ------- | ------------------ |
| Success | `success@razorpay` |
| Failure | `failure@razorpay` |

Card: 4100 2800 0000 1007
CVV: 123
Expiry: 12/30
OTP: 1234
