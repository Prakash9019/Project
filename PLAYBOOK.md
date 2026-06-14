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

```bash
cd frontend
npm install
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
