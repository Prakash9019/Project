# Proximity Social — Backend

Real-Time Nearby Social Discovery Layer. Flips the legacy *Swipe → Match → Message* loop into
**Proximity → Intro Request → Accept/Decline → Chat**.

## Stack
- **Node.js + TypeScript + Express** — REST API
- **Socket.IO** — real-time grid presence, intro-request notifications, live chat, typing
- **PostgreSQL + Prisma** — durable data (users, requests, conversations, billing, safety)
- **Redis** — geo-spatial discovery index (`GEOSEARCH`), OTP store, daily request-cap counters, presence

## Getting started
```bash
cp .env.example .env          # fill in secrets / DB / Redis URLs
npm install
npm run prisma:generate
npm run prisma:migrate         # creates tables (needs a running Postgres)
npm run dev                    # http://localhost:4000
```
You also need a local **PostgreSQL** and **Redis** running (see `.env`).

## Core flows
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

## Design notes
- **Fuzzy location**: precise GPS lives only in Redis and is never returned — clients get a rounded
  `distanceLabel` (e.g. `"0.4 km away"`).
- **E2E chat**: the server stores opaque `ciphertext` only; encryption happens on the client.
- **Anti-spam**: intro messages are plain-text, ≤200 chars, no links/markup; free tier is capped at
  `FREE_TIER_DAILY_REQUESTS`/day, with a-la-carte credits or subscription upgrades beyond that.
- **Reply boosting**: `reputationScore` rises on accepts, decays on ignores, and re-ranks the grid.

npm test                  # run before every commit
npm run test:watch        # while actively coding
npm run test:coverage     # before a release

The machine-readable API contract lives in `../backend-spec.json` (consumed by the frontend-from-spec skill).
