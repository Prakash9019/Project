# Backend — Technical Reference

**App:** Proximity Social / NearMe — a real-time, location-based social discovery platform.
**Audience:** Backend engineers.
**Stack:** Node.js + TypeScript + Express + Socket.IO + Prisma/PostgreSQL + Redis.

> The machine-readable API contract lives in `backend-spec.json` at the repo root. This doc is the human reference for it.

---

## 1. Tech stack

| Concern | Choice |
|---|---|
| Runtime / language | Node.js, TypeScript (ES2021 target, strict mode) |
| HTTP framework | Express 4.19 |
| Real-time | Socket.IO 4.7 (WebSocket) |
| ORM / DB | Prisma 5.18 → PostgreSQL |
| Cache / geo / presence / rate-limit | Redis (ioredis 5.4) |
| Background jobs | Bull 4.16 (Redis-backed) + node-cron 4.2 |
| Auth | JWT (access + refresh w/ token-family reuse detection) |
| Validation | Zod 3.23 |
| Payments | Razorpay (India) + Stripe (fallback) |
| Calls | Agora RTC (server-side token minting) |
| Media | Google Cloud Storage (pre-signed upload/download URLs) + Multer |
| AI / moderation | Anthropic Claude (`claude-sonnet-4-6` for features, `claude-haiku-4-5-20251001` for moderation) |
| Email | Nodemailer (SMTP) |
| Observability | Prometheus (`prom-client`), Morgan + request-id logging |
| Security | Helmet, CORS, Redis rate limiting |

---

## 2. Directory layout

```
src/
  adapters/    External service clients (razorpay, stripe, agora, gcs, sms, moderation, ai)
  admin/       Bull Board queue dashboard (basic-auth protected)
  config/      env.ts, redis, prisma, prometheus metrics
  jobs/        Bull queues + cron processors
  middleware/  auth, validation, error handling, subscription/plan limits
  modules/     Feature domains (auth, profile, grid, chat, calls, discovery, explore,
               verification, monetization, safety, albums, ai, city-profiles)
  realtime/    Socket.IO handlers + event emitter
  services/    email, push, moderation, repeat-offender, image moderation
  utils/       jwt, otp, geo, blocks cache, callFlags, profileScore
  app.ts       Express app construction + route mounting
  index.ts     Entry point, server boot, graceful shutdown
prisma/
  schema.prisma     Source of truth for the DB (29 models, 24 enums)
  migrations/        ⚠️ broken for fresh DBs — see PLAYBOOK.md, use `prisma db push`
```

---

## 3. Server startup (`src/index.ts`)

1. **Validate env** — hard-fails on missing required vars (see §9).
2. `createApp()` (`src/app.ts`) builds the Express app.
3. Wrap in an HTTP server, attach **Socket.IO**.
4. Start **Bull processors** — call watchdog, daily reset, subscription expiry.
5. Listen on `env.port` (default **4000**).

**Global middleware chain** (`src/app.ts:33-139`), in order:
compression (>1024 B) → 30s request timeout → request-ID → Helmet (CSP/HSTS/frame-guard) → CORS → JSON & urlencoded body parsing (100 kb cap) → Morgan (dev only) → custom request logger.

**Unauthenticated infra endpoints:**

| Endpoint | Purpose |
|---|---|
| `GET /health` | `{status:"ok"}` |
| `GET /health/live` | Liveness probe |
| `GET /health/ready` | Readiness — checks Postgres, Redis, GCS |
| `GET /metrics` | Prometheus text format |
| `GET /admin/queues/*` | Bull Board UI (basic-auth) |

**API base path:** `/api/v1` (a handful of newer routes are mounted at `/api/...` — noted below).

---

## 4. Data model (`prisma/schema.prisma`)

### User (the central entity)
Key field groups:
- **Identity / auth:** `id` (UUID), `phone` (E.164, unique), `phoneVerified`.
- **Profile:** `name`, `firstName`, `age`, `gender`, `bio` (plan-capped: free 150 / premium 400 / gold·platinum 600), `height`, `weight`, `bodyType`, `skinTone`, `aboutMe`, `relationshipStatus`, `lookingFor`, `datingIntentions`, `interests`, `tribes`, `tags`, `topArtists`, `whereWeCanMeet`.
- **v2 identity:** `genderIdentity`, `sexualOrientation`, `wantToSee`, `relationshipIntent`, `whoCanDiscoverMe`.
- **Verification:** `phoneVerified`, `photoVerified`, `faceVerified`, `isVerified` (= phone && face), `isCollegeVerified`, `verifiedBadge`.
- **Subscription:** `plan` (free/premium/gold/platinum), `planExpiresAt`, legacy `tier`.
- **Media:** `photos[]`, `voiceClipUrl`, `videoClipUrl`.
- **Location (private, never exposed):** `locationLat`, `locationLng`, `locationUpdatedAt`.
- **Grid visibility:** `isOnGrid` (panic-hide), `incognitoMode`, `hideActiveStatus`, `hideLastSeen`, `hideExactDistance`.
- **Free-tier call meters:** `dailyAudioMinutesUsed`, `dailyVideoMinutesUsed`, `dailyCallMinutesResetDate`.
- **Engagement:** `reputationScore`, `historicalReplyRate`, `profileCompletenessScore`.
- **Safety:** `restrictedUntil`, `isBanned`, `interactionPenaltyUntil`, `interactionPenaltyMultiplier`.

### Messaging
- **Conversation** — unique `[userAId, userBId]`; `state` (pending/active/dismissed), `initiatorId`, `aHasReplied`/`bHasReplied` (call gate), per-side `aIsHidden`/`bIsHidden`, `aPinned`/`bPinned`, archive/delete timestamps, `lastMessageAt`.
- **Message** — `type` (text/photo/video/voice/expiring_photo/voice_note), `ciphertext`, `content`, `mediaUrls`, `viewOnce`, `expiresInSeconds`, `expiresAfterView`, `viewedAt`, unsend (`isUnsent`/`unsentAt`), edit (`isEdited`/`editedAt`/`originalContent`), `translatedContent`, moderation flags, `readAt`, `deletedAt`.
- **Call** — `callerId`, `calleeId`, `type`, `status`, timing fields, `durationSec`, `agoraChannelName`, `agoraToken`, `endReason`, `scheduledAt`.

### Discovery
`Favorite` (shortlist), `Tap` (like), `ProfileView` (Gold+), `Album` + `AlbumPhoto` (v3), legacy `PrivateAlbum` + `PrivateAlbumGrant`.

### Monetization
`Subscription`, `CreditWallet` + `CreditLedger`, `FeedBoost`, `AddOnPurchase` (boosts, spotlight, chat packs, travel passes, verified badge, call top-ups).

### Safety & trust
`Block`, `Report`, `Mute`, `Verification`, `ModerationFlag`.

### Other
`UserSettings`, `ProfilePrompt`, `SavedPhrase`, `MessageTemplate`, `CityProfile`, `UserInteraction` (free-tier lifetime cap), `RefreshToken` (SHA-256 hash + family for reuse detection, 7-day TTL).

### Key enums
`Plan`, `BillingCycle`, `Gender`, `BodyType`, `SkinTone`, `RelationshipStatus`, `LookingForOption`, `DatingIntention`, `GenderIdentity`, `SexualOrientation`, `WantToSee`, `RelationshipIntent`, `CallType`, `CallStatus`, `VerificationType`, `VerificationStatus`, `ReportReason`, `AddOnType`. (Full value lists in `schema.prisma`.)

---

## 5. API surface

Auth is required on everything except `/auth/firebase`, `/auth/dev-login`, `/auth/refresh`, and `/health*`/`/metrics`.

> **Online status:** the grid-card and public-profile serializers compute `activity = { online, label }` from `lastActiveAt` vs the `ONLINE_WINDOW_SECONDS` presence window. `activity.online` is the boolean the client uses for the green dot; the `label` is the human string (`"Active Now"`, `"Active 5 mins ago"`, …). The card's `lastActiveAt` field carries that **label**, which is why the client must not compare it to the literal `"online"`.

### Auth — `/api/v1/auth`  *(Firebase-based — replaced phone OTP)*
| Method | Path | Purpose |
|---|---|---|
| POST | `/firebase` | Verify a Firebase ID token (email/password or Google) → issue access+refresh tokens, `{ accessToken, refreshToken, user, profileComplete, isNewUser }` |
| POST | `/dev-login` | Email+password dev shortcut (non-prod) → same token payload |
| POST | `/refresh` | Rotate tokens (family reuse → revoke all) |
| POST | `/logout` | Revoke refresh-token family |
| GET | `/me` | Current user + photos + settings; includes `primaryPhotoUrl` and (free tier) `callLimits` |

> The legacy `/request-otp` & `/verify-otp` routes have been removed; sign-in is handled by Firebase on the client, which then exchanges the Firebase ID token here. JWT issuance, refresh-token family reuse detection, and ban checks are unchanged.

### Profile — `/api/v1`
`PATCH /me` · `PATCH /me/settings` · `POST /me/location` · `POST /me/photos` · `PUT /me/photos/:id/primary` · `DELETE /me/photos/:id` · prompts CRUD (`/me/prompts`) · PIN lock (`/me/pin`, `/me/pin/verify`) · `GET /catalogs` · `GET /users/:id` (public profile) · `GET /users/:id/albums` · `POST /me/voice-clip` & `/me/video-clip` (Premium+) · `GET /me/upload-url` & `/me/photos/upload-url` (pre-signed GCS).

### Grid (discovery) — `/api/v1/grid`
`GET /` — geo search. Params: `lat`, `lng`, `radius`, `onlineOnly`, `ageMin/Max`, `heightMin/Max`, `bodyType`, `tribes`, `tags`, `lookingFor`, `sort` (distance|fresh). **Plan-gated filters silently dropped if plan insufficient:** `verifiedOnly`, `activeLast5Min`, `activeLast30Min`, `recentlyJoined`, `highReplyRate`. Returns `{ radiusM, total, limit, offset, planLimit, cards[] }`.

### Chat — `/api/v1/conversations`
`POST /start` · `GET /` (folder inbox|requests) · `GET /:id/messages` · `POST /:id/messages` · `POST /:id/read` · `DELETE /:id` · `POST /:id/dismiss` · pin/unpin · message edit / unsend / delete / view (expiring) / translate · saved phrases & templates (Premium+).

### Calls — `/api/v1/calls`
`GET /ice-config` (STUN/TURN) · `GET /` (history) · `POST /` (initiate; requires call gate) · `POST /schedule` · `PATCH /:id` (status + endReason).

### Discovery actions — `/api/v1/discovery`
favorites (shortlist) CRUD · `POST /taps` (like) + `GET /taps` (taps received) · `GET /views` (who-viewed-me, **Gold+ only — 403 for lower plans**) · `GET /right-now` (nearby users with an active Right Now status) · legacy private albums + grants.

**Powers the Interest tab:** the **Views** list comes from `GET /views`; the **Taps** list from `GET /taps`. A `ProfileView` row is upserted whenever a user opens another user's profile via `GET /users/:id` (skipped if the viewer is incognito or viewing themselves) — so opening a profile from the grid is what makes views accrue. `POST /taps` records a tap and emits `tap.received` to the recipient in real time.

### Explore — `/api/v1/explore` (Premium+)
`GET /` (worldwide search) · `GET /for-you` (curated 4 by overlap).

### Verification — `/api/v1/verification`
`GET /status` · `POST /photo` · `POST /face` · `POST /identity` (DigiLocker/Stripe Identity) · `POST /college` + `/college/confirm` · `GET /profile-views` & `/analytics` (Gold+).

### Billing — `/api/v1/billing`
plans/addons catalogs · `GET /subscriptions/current` · `POST /subscriptions` · `POST /subscriptions/verify` · `DELETE /subscriptions/current` · addon purchase/verify/active · wallet & credits · legacy boosts.

### Safety — `/api/v1/safety`
`GET /blocks` · block/unblock · mutes · `POST /users/:id/report` · `POST /panic-hide`.

### Albums (v3) — `/api/albums`
list/create/get/update/delete album · add/remove/reorder photos · `GET /users/:id/albums` (view another user's albums, block-safe — powers the profile **Albums** section).

> **Photo serialization:** album cover and photo objects are returned as `{ id, url, order, createdAt }` (the signed GCS URL field is **`url`**, not `photoUrl`). The client type `AlbumPhoto` was corrected to match. Photo uploads expect an already-uploaded GCS path (the client uses the pre-signed upload-url flow); posting a raw local URI will not produce a viewable signed URL.

### City profiles (Gold+) — `/api/v1/city-profiles`
list/create/activate/delete (travel mode).

### AI (Platinum) — `/api/v1/ai`
`GET /icebreakers` · `/reply-suggestions` · `/compatibility/:id` (deterministic) · `/top-10` · `/profile-optimizer`. AI text features require user opt-in.

### Me — `/api/v1/me`
`GET /export` (GDPR) · `DELETE /` (account deletion; requires PIN verify).

---

## 6. Real-time (Socket.IO — `src/realtime/socket.ts`)

**Handshake:** client sends `auth: { token }`; server verifies the JWT, extracts `userId` + `plan`, joins room `user:<userId>`. Active connections counted in Prometheus.

**Client → server:**
- `location:update { lat, lng }` — GEOADD + extend presence
- `heartbeat` — extend presence window (default 120s TTL)
- `typing { conversationId, isTyping }` — relayed (Premium+ only)
- `call:invite { calleeId, type, offer }` — creates Call, emits to callee
- `call:answer { callId, answer }` · `call:ice { callId, candidate, targetId }` · `call:decline { callId }` · `call:end { callId }`

**Server → client (push):**
- `message.created` — new message (never includes `originalContent`)
- `message.read` / `message.unsent` / `message.edited`
- `call:invite` / `call:answer` / `call:end { endReason }` / `call:reminder` (5 min before scheduled)
- `verification.complete { isVerified: true }`
- `tap.received { tapId, senderId, senderCard, createdAt }`

---

## 7. Key business logic

**Auth (Firebase)** (`modules/auth/*`): the client authenticates with Firebase (email/password or Google) and sends the resulting **Firebase ID token** to `POST /auth/firebase`. The server verifies it, finds-or-creates the user, and issues NearMe tokens (15 min access + 7 day refresh). Refresh tokens are stored hashed with a **family ID** — replaying a used token revokes the whole family. `dev-login` provides an email+password shortcut for non-production. (Phone-OTP auth has been retired.)

**Geo-discovery grid** (`modules/grid/*`): `GEOSEARCH geo:users` around the viewer → filter (self, blocked, inactive 14d+, incognito, stealth) → DB attribute filters → in-memory orientation cross-match (`wantToSee` × `whoCanDiscoverMe`) → presence filter → load boosts → **rank: boosted > platinum > gold > premium > free, then distance, completeness, reply rate** → apply plan grid cap (free 100, premium 600, gold/platinum unlimited). Distances **fuzzed ±0.1 km** before leaving the server.

**Intro-request / conversation start** (`modules/chat/*`): blocks both directions + stealth checked; free tier capped at **20 unique lifetime interactions**; conversation keyed on sorted `[min,max]` user IDs; starts `pending`, promotes to `active` when the recipient replies.

**Call gate** (`utils/callFlags.ts`): audio/video only unlock once **the other party has sent ≥1 message** (`aHasReplied`/`bHasReplied`). Prevents one-sided call spam.

**Chat** (`modules/chat/*`): participant check → call-gate check → optional Claude moderation → create Message → bump `lastMessageAt` + reply flags → emit `message.created` → push if not muted → update reply rate. Supports unsend, edit (5-min window), expiring photos, translate, read receipts (Premium+).

**Verification**: photo/face moderated then AI-scored; face approval sets `isVerified` and emits socket event. Identity via DigiLocker/Stripe; college via edu-email OTP.

**Billing**: create order (Razorpay India / Stripe else) → pending metadata in Redis (30-min TTL) → verify signature (HMAC-SHA256) → upsert Subscription + set `plan`/`planExpiresAt`; idempotent per order. Add-ons follow the same flow.

**Safety**: block hides conversations both sides, terminates active calls (`endReason=blocked`), busts the blocked-IDs Redis cache. Reports create a `ModerationFlag`; an async repeat-offender check flags for review at ≥3 reports and **auto-bans at ≥10**. Panic-hide instantly removes the user from grid + pauses incoming messages.

**Profile score** (`utils/profileScore.ts`): firstName +20, age +10, primary photo +15, bio≥50 chars +15, interests/tribes +10, lookingFor +10, height +10, genderIdentity +10 (max 100). Feeds grid ranking.

---

## 8. External integrations (`src/adapters/`)

All have **dev stubs** that activate when credentials are absent (mock orders/tokens/URLs, console logging).

| Adapter | Role |
|---|---|
| `razorpay.ts` | Create order (paisa), verify HMAC signature |
| `stripe.ts` | Payment intents, status retrieval |
| `agora.ts` | RTC token minting; channel `nearme-<conversationId>-<ts>` |
| `gcs.ts` | Pre-signed upload/download URLs (15-min), delete |
| `moderation.ts` / `ai.ts` | Claude text/image moderation + AI features; rule-based fallback |
| `sms.ts` | OTP delivery |
| `email.ts` (service) | College OTP + notifications via Nodemailer |

---

## 9. Configuration / env vars

**Required (hard-fail at boot):** `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`, `GCS_BUCKET_NAME`, `GCS_SERVICE_ACCOUNT_KEY`.
> ⚠️ The last six are only **presence-checked** — dev placeholders let the server boot (see PLAYBOOK.md). Real keys are only needed for billing, calls, and uploads.

**Optional (warn):** `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `DIGILOCKER_CLIENT_ID/SECRET`, `GOOGLE_MAPS_SERVER_KEY`, `AWS_*`, `ENCRYPTION_KEY`.

**Tunables:** `PORT` (4000), `NODE_ENV`, `CORS_ORIGIN`, `OTP_DEV_RETURN`, `OTP_TTL_SECONDS`, `FREE_TIER_DAILY_REQUESTS` (5), `FREE_TIER_DAILY_EXPIRING_PHOTOS` (5), `DEFAULT_RADIUS_M` (5000), `SHRINK_RADIUS_M` (500), `DISTANCE_FUZZ_KM` (0.1), `ONLINE_WINDOW_SECONDS` (120), `NATIONWIDE_RADIUS_M` (2,000,000), `FEED_BOOST_DURATION_MINUTES` (30), `REPORT_THRESHOLD_FOR_REVIEW` (3), `REPORT_THRESHOLD_FOR_BAN` (10).

---

## 10. Background jobs (`src/jobs/`)

| Job | Trigger | Action |
|---|---|---|
| `call-watchdog` | Per free-tier call | At time limit: end call (`endReason=time_limit_reached`), bump daily minutes, emit `call:end` |
| `scheduled-calls` | `POST /calls/schedule` | 5 min before: emit `call:reminder` to both |
| `daily-reset` | Cron 00:00 UTC | Zero daily audio/video minutes for free users |
| `subscription-expiry` | Cron 01:00 UTC | Downgrade expired plans → free, unpin chats |

**Fire-and-forget (no queue):** recompute profile completeness, update reply rate, repeat-offender check, lazy plan-expiry downgrade.

---

## 11. Middleware & security

- **Auth** (`middleware/auth.ts`): Bearer JWT verify → Redis ban check (O(1)) → populate `req.user` + `req.effectiveLimits`; lazy plan-expiry downgrade; debounced `lastActiveAt` (≤1 write / 60s / user via Redis NX).
- **Plan/subscription** (`middleware/subscription.ts`): computes `effectiveLimits` (bioChars, gridProfiles, interactionCap, pinChats, call minutes, expiring photos, AI features, explore/whoViewedMe access, etc.); `requirePlan(...)` → 403 with required+current plan.
- **Validation** (`middleware/validate.ts`): Zod on body/query → 400 with details.
- **Errors** (`middleware/error.ts`): `HttpError` → structured JSON; global 404 handler.
- **Helmet**: CSP, HSTS (1 yr), `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`.
- **Rate limits (Redis):** auth/refresh endpoints rate-limited per IP; other sensitive routes limited per user. (The previous OTP-specific limits were removed with the OTP flow.)

---

## See also
- `PLAYBOOK.md` — local setup, Docker, the migrations gotcha.
- `docs/technical/FRONTEND.md` — the client that consumes this API.
- `backend-spec.json` — machine-readable contract.
