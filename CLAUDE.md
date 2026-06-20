# NearMe — Project Guide (entry point for any Claude session)

> **Read this first, every session.** NearMe is a **Real-Time Proximity Social
> Discovery** app (a Grindr-style proximity grid). It is a **real full-stack
> product** — there is a complete backend. Do **not** treat the frontend as a
> mock/standalone clone. (Note: `frontend/CLAUDE.md` is an older doc describing a
> mock-only build; **this root file is authoritative**.)

## What this project is

- **Frontend:** React Native + Expo SDK 56, `expo-router`, TypeScript (strict).
- **Backend:** Express + Prisma + PostgreSQL + Redis + Socket.IO.
- The full backend is implemented and documented in **`backend-spec.json`** (the
  single source of truth for every API contract).

## How to run

```bash
# Backend
cd backend && npm run dev

# Frontend
cd frontend && npx expo start
# Use a device build (NOT Expo Go) for Agora calls + Razorpay payments:
npx expo run:ios   # or: npx expo run:android
```

> Dependency note: install native modules with `npm install <pkg> --legacy-peer-deps`
> (react/react-dom peer ranges trip `npx expo install`'s ERESOLVE check).

## Auth

Firebase Auth (email/password + Google Sign-In).
Client gets a Firebase ID token → `POST /api/v1/auth/firebase` → NearMe JWT
(`{ accessToken, refreshToken, profileComplete, isNewUser, user }`).
Tokens are stored in **SecureStore**. Session is rehydrated via `GET /api/v1/auth/me`.
On 401 the API client refreshes once via `POST /api/v1/auth/refresh`.

## Key rules every session must follow

1. **Read `backend-spec.json` before ANY API call** — never guess paths/fields.
2. Use **`useTheme().theme.*` for ALL colors** — zero hardcoded hex values.
3. Call buttons (audio + video) are **always visible** in chat — disabled until
   `audioCallEnabled` / `videoCallEnabled` come back `true` from the API.
4. Free tier = **20 unique people lifetime** cap (not daily). 403
   `interaction_limit_reached` → show `UpgradeModal`, never a raw error.
5. **14-day inactivity filter** on all discovery — enforced server-side.
6. `isVerified` = `phoneVerified && faceVerified` (computed server-side).
7. Never expose raw GCS paths — all media arrives as signed URLs from the backend.
8. **Zero TypeScript errors at all times** — `cd frontend && npx tsc --noEmit`.

## Project structure

```
backend/                 — Express API, Prisma, all business logic
backend-spec.json        — SINGLE SOURCE OF TRUTH for API contracts
frontend/
  app/                   — expo-router screens (file = route)
  src/
    types/api.ts         — TS types generated from the spec models
    services/api.ts      — typed API client (one function per endpoint)
    services/auth.ts     — Firebase + JWT token management (SecureStore)
    services/socket.ts   — Socket.IO singleton + helpers
    store/               — Zustand stores (auth, grid, chat, filter, theme)
    theme/               — ThemeContext, colors.ts (Light/Dark), typography.ts
    lib/                 — format/plans/toast helpers
    components/          — shared UI components
  ui_images/             — UI reference screenshots (design source of truth)
```

## Screens

| File | Screen |
|------|--------|
| `app/(tabs)/index.tsx` | Grid / Browse |
| `app/(tabs)/right-now.tsx` | Right Now |
| `app/(tabs)/interest.tsx` | Interest (Views + Taps) |
| `app/(tabs)/inbox.tsx` | Conversations |
| `app/(tabs)/store.tsx` | Plans + Add-ons |
| `app/profile/[id].tsx` | Public profile |
| `app/chat/[id].tsx` | 1:1 chat |
| `app/call/[id].tsx` | Audio/video call |
| `app/settings/index.tsx` | Settings |
| `app/settings/edit-profile.tsx` | Edit profile |
| `app/filters.tsx` | Grid filters |
| `app/explore.tsx` | Travel mode |
| `app/onboarding/auth.tsx` | Firebase login/signup |
| `app/onboarding/setup.tsx` | New-user profile setup |

## Backend API base

`EXPO_PUBLIC_API_URL` (from `frontend/.env`) — default `http://localhost:4000`.
All endpoints are under `/api/v1/*` (a few legacy routes use `/api/*`).

## Discovery / profile contracts (now implemented backend-side)

These were frontend-brief additions and are **now live in the backend** (see the
`notes[]` entries in `backend-spec.json`):

- `GET /api/v1/discovery/views` — who viewed me (Gold+). Returns
  `{ views: [{ id, viewer: UserCard, viewedAt }] }`.
- `GET /api/v1/discovery/taps` — taps received → `{ taps: [{ id, sender, createdAt }] }`.
  `POST /api/v1/discovery/taps` sends a tap.
- `GET /api/v1/discovery/right-now` — nearby active Right Now statuses →
  `{ statuses: UserCard[] (+ rightNowStatus/Category/ExpiresAt), total }`.
- **Right Now** fields on `User`: `rightNowStatus`, `rightNowCategory`,
  `rightNowExpiresAt` (migration `20260617_right_now_fields`). Set via `PATCH /api/v1/me`;
  clear by sending the three as `null`. `UserCard` carries `rightNowActive`.
- `GET /api/v1/me/photos/upload-url` (alias of `/api/v1/me/upload-url`) →
  `{ uploadUrl, gcsPath, expiresAt }`. Client PUTs bytes, then `POST /api/v1/me/photos { url }`.
- `GET /api/v1/auth/me` (`Self`) now includes **`primaryPhotoUrl`** (published primary
  photo URL or null) and **`callLimits`** (see below).

## callLimits (free-tier call countdown)

`GET /api/v1/auth/me` returns `callLimits` for **free** users (null for paid):
```
callLimits: {
  audioMinutesUsed, audioMinutesLimit,   // base 5 + active audio_call_topup add-ons
  videoMinutesUsed, videoMinutesLimit,   // base 2 + active video_call_topup add-ons
}
```
Resets at UTC midnight; lets the client show a live countdown during free calls.

## Known deferred items

- Phone-number PII encryption (`encrypt.ts` ready, not wired).
- `call:invite` socket event needs `agoraToken` added to the callee payload.
- No `message.delivered` event exists; the client treats a server-acked message
  as "delivered" and flips to "read" on the `message.read` event.

## After any change

`cd frontend && npx tsc --noEmit` must exit 0. UI must match `frontend/ui_images/`.
