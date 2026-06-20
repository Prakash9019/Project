# Frontend — Technical Reference

**App:** NearMe — Expo / React Native mobile client for the Proximity Social platform.
**Audience:** Mobile engineers.
**Stack:** Expo SDK 56 · React Native 0.85 · React 19 · TypeScript · expo-router · Zustand · Socket.IO.

---

## 0. Recent changes (dating-app polish iteration)

This iteration reworked discovery → profile flow, navigation, status indicators, the inbox, and albums. Summary (details in the sections below):

| Area | Change | Files |
|---|---|---|
| **Navigation icons** | Replaced the faded custom SVG/`water` icons with Ionicons that render **solid when active / outline when inactive** (`grid`, `flash`, `heart`, `chatbubble-ellipses`, `diamond`). Active label bolds. | `app/(tabs)/_layout.tsx` |
| **Grid tap behavior** | Tapping a card now opens the **public profile** (was: started a chat). Long-press handler removed. | `app/(tabs)/index.tsx` |
| **Profile detail redesign** | Inline **"Say something…" composer** that sends without leaving the screen; **Fire/Tap** + **Chat** action buttons; shortlist **star moved to the hero bar**; **Albums** section added. | `app/profile/[id].tsx` |
| **Online indicator (bug fix)** | The green dot never showed: client compared `lastActiveAt === 'online'`, but the API label is `'Active Now'`. Now reads the authoritative `activity.online` flag (added to `UserCard`). Fixed on grid, profile, and inbox. | `UserCardTile.tsx`, `profile/[id].tsx`, `inbox.tsx`, `types/api.ts` |
| **Inbox cleanup** | De-duplicate rows **by peer id** (one card per person); removed plan badge, verified badge, audio/video-call icons, and pin icon — rows now show photo (+online), name, last message, time, unread count only. | `app/(tabs)/inbox.tsx` |
| **Albums (bug fix)** | API returns photo URLs as `url`, but the type/screens used `photoUrl` → covers/photos never rendered. Renamed `AlbumPhoto.photoUrl → url`. Added `uploadAlbumPhoto()` (GCS upload-url → PUT → save path) so picks aren't stored as raw `file://` URIs. | `types/api.ts`, `services/api.ts`, `albums/index.tsx`, `albums/[id].tsx` |
| **Dynamic Views/Taps** | Confirmed end-to-end: a `ProfileView` is recorded server-side when a profile opens (now triggered by the grid tap), taps via `tapUser`. Interest screen reads live `getViews`/`getReceivedTaps` — no mock data. | (backend `getPublicProfile`, `interest.tsx`) |

> **Verification:** `cd frontend && npx tsc --noEmit` exits 0 after these changes.

---

## 1. Tech stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | Expo SDK ~56.0.11, React Native 0.85.3, React 19.2.3 | TypeScript strict |
| Routing | `expo-router` ~56.2 | File-based, typed routes (`experiments.typedRoutes`) |
| State | `zustand` ^5 | auth, grid, chat, filter stores |
| Token storage | `expo-secure-store` | encrypted access/refresh tokens |
| Local cache | `@react-native-async-storage/async-storage` | grid cache, conversations cache, theme |
| Real-time | `socket.io-client` ^4.8 | chat, typing, calls, presence |
| Calls | `react-native-agora` ^4.5 | native-only; web loads a null guard |
| Payments | `react-native-razorpay` ^3 | native-only; guarded require |
| Location | `expo-location` | GPS → grid query + `/me/location` |
| Media | `expo-image`, `expo-image-picker` | optimized images, camera/gallery |
| UI | `@expo/vector-icons`, `expo-linear-gradient`, `react-native-svg`, `react-native-reanimated` (+ worklets), `react-native-gesture-handler`, `react-native-safe-area-context`, `react-native-screens` | |
| UX | `react-native-toast-message`, `@react-native-community/netinfo` | toasts, offline detection |

**Env vars (build-time, inlined):**
```
EXPO_PUBLIC_API_URL=http://localhost:4000   # backend base URL
EXPO_PUBLIC_AGORA_APP_ID=<agora app id>
EXPO_PUBLIC_RAZORPAY_KEY_ID=<razorpay public key>
```
> ⚠️ `localhost` only works on the iOS simulator and web. On a physical device / Android emulator, set it to your machine's LAN IP (`ipconfig getifaddr en0`).

**Scripts:** `npm start` (Expo), `android`, `ios`, `web`.

---

## 2. Navigation (expo-router, `app/`)

```
app/
  _layout.tsx              Root Stack — error boundary, incoming-call sheet, offline banner, toasts
  index.tsx                Splash — auth check → /(tabs) or /onboarding
  onboarding/
    _layout.tsx            Nested stack
    index.tsx              Welcome (Get Started / Log In)
    auth.tsx               Firebase login/signup (email+password, Google) → POST /auth/firebase → JWT
    intro.tsx              4-slide carousel
    setup.tsx              Multi-step profile completion
    terms.tsx / privacy.tsx  Legal (LegalScreen component)
    phone.tsx / otp.tsx    Legacy OTP screens (no longer in the active flow — Firebase replaced them)
  (tabs)/
    _layout.tsx            CustomTabBar (5 tabs; Ionicons solid=active / outline=inactive)
    index.tsx              BROWSE — 3-col discovery grid; tap a tile → public profile
    right-now.tsx          RIGHT NOW — set/clear ephemeral status + nearby active feed
    interest.tsx           INTEREST — Views (Gold+) & Taps tabs, live data, tap-back
    inbox.tsx              Conversations (clean rows, deduped by peer)
    store.tsx              Plans + add-ons (Razorpay)
  profile/[id].tsx         Public profile detail — inline composer + Tap/Chat + albums
  chat/[id].tsx            1:1 messages + typing + socket
  call/[id].tsx            Full-screen Agora call
  filters.tsx              Modal — discovery filters
  explore.tsx              Modal — "set location" (placeholder)
  settings/index.tsx       Modal — toggles, AI opt-ins, logout
  settings/edit-profile.tsx  Full profile editor
  albums/index.tsx         Album grid
  albums/[id].tsx          Album detail
  verification.tsx         Verification status + submit
```

**Presentation modes:** Stack (`slide_from_right`) for onboarding/tabs/chat/profile; `modal` for filters/explore/settings; `fullScreenModal` (fade) for the call screen.

**Auth gating:** splash checks `isAuthenticated()` (token in SecureStore). A 401 that fails refresh triggers `setOnAuthFailure` → redirect to `/onboarding`.

---

## 3. Screens (highlights)

| Screen | Path | What it does |
|---|---|---|
| Splash | `app/index.tsx` | Animated logo + auth routing |
| Auth | `app/onboarding/auth.tsx` | Firebase email/password + Google sign-in → `firebaseLogin(idToken)` → NearMe JWT |
| Setup | `app/onboarding/setup.tsx` | 4-step: name/age/gender → identity/orientation/intent → photo → finish |
| Browse | `app/(tabs)/index.tsx` | 3-col `UserCardTile` grid, location-gated, quick filters, pull-refresh, pagination, auto-refresh every 3 min. **Tap → `/profile/[id]`** |
| Right Now | `app/(tabs)/right-now.tsx` | Set/clear an ephemeral "Right Now" status (`PATCH /me`) + browse nearby active statuses (`GET /discovery/right-now`) |
| Interest | `app/(tabs)/interest.tsx` | **Views** tab (Gold+; locked/blurred grid + upgrade CTA for free) and **Taps** tab (ungated, with tap-back). Live counts from `getViews`/`getReceivedTaps` |
| Inbox | `app/(tabs)/inbox.tsx` | Clean conversation rows (photo+online dot, name, last message, time, unread). Deduped **by peer id**. `message.created` socket listener |
| Store | `app/(tabs)/store.tsx` | Plan cards (Free/Premium/Gold/Platinum) + billing-cycle tabs + add-ons → Razorpay |
| Profile | `app/profile/[id].tsx` | Public view; gallery, bio/stats/sections, **albums**; bottom **inline composer + Fire(tap) + Chat**; shortlist star + menu (report/block) in hero |
| Chat | `app/chat/[id].tsx` | Message list + input; socket join/listen; typing; call gating (unlocks after peer replies) |
| Call | `app/call/[id].tsx` | Agora video/audio, mute/camera/speaker/flip, elapsed timer, `call:end` listener |
| Filters | `app/filters.tsx` | Age/height/body type, sort, plan-gated toggles |
| Settings | `app/settings/index.tsx` | Theme, privacy toggles, AI opt-ins, data export, delete account, logout |
| Edit profile | `app/settings/edit-profile.tsx` | Bio, photos, prompts, clips (Premium+) |
| Verification | `app/verification.tsx` | Phone/photo/face status + submit (camera) |

---

## 4. State management (`src/store/`)

| Store | State | Key actions |
|---|---|---|
| `authStore` | `user: Self`, `hydrating` | `login()` (persist tokens), `logout()`, `refreshUser()` (GET /auth/me), `setUser()` |
| `gridStore` | `cards`, `total`, `offset`, loading flags | `fetchGrid()`, `fetchMore()` (offset pagination, 20/page), `hydrateCache()` (AsyncStorage `cache_grid_cards`) |
| `chatStore` | `conversations` | `fetchConversations(folder)`, `applyIncomingMessage()` (bump unread), `markRead()`; cache key `cache_conversations` |
| `filterStore` | `filters`, `version` | `setFilters()`, `apply()` (bumps `version` → Browse refetches), `reset()`, `toQuery()` |
| Theme | `ThemeContext` (React Context, not Zustand) | `mode` dark/light persisted to `theme_mode`; default **dark** |

---

## 5. API layer (`src/services/api.ts`, `config.ts`)

Base URL from `EXPO_PUBLIC_API_URL` (fallback `http://localhost:4000`).

```ts
request<T>(method, path, body?, opts?: { auth?, isRetry?, query? }): Promise<T>
```
- Builds URL + query (`URLSearchParams`); headers `Content-Type`, `X-Request-ID` (UUID v4), `Authorization: Bearer <token>`.
- **Auto-refreshes once on 401**, then retries the original request.
- Throws `ApiError` (`status`, `code`, `data`) parsed from `{ message, error, ... }`. `204` → `undefined`.

**Endpoints wired up** (grouped): auth (**`firebaseLogin` → `POST /auth/firebase`**, `devLogin`, refresh, logout, `getMe`) · profile (`/me`, settings, location, photos, prompts, export, delete) · grid · conversations (start/list/messages/send) · calls (initiate/update/history) · discovery (taps, favorites, **views**, **right-now**) · safety (block/report/blocks) · verification (status/photo/face) · albums (CRUD + photos + reorder, **`uploadAlbumPhoto`**, **`getUserAlbums`**) · billing (subscriptions + add-ons + verify) · catalogs & prompts · public profile (`/users/:id`).

**Auth flow:** client signs in with Firebase (email/password or Google) → obtains a Firebase ID token → `firebaseLogin(idToken)` exchanges it for a NearMe `{ accessToken, refreshToken, profileComplete, isNewUser, user }`. Tokens live in SecureStore; session rehydrates via `getMe()`; 401 auto-refreshes once via `/auth/refresh`.

**New/changed client functions this iteration:**
- `uploadAlbumPhoto(albumId, localUri)` — GCS upload-url → PUT bytes → `addAlbumPhoto(albumId, gcsPath)`; falls back to posting the local URI. Mirrors `uploadProfilePhoto`.
- Profile composer uses `startConversation(id)` then `sendMessage(conv.id, { type:'text', content })` to send inline without navigating.

> Note: a few client calls use slightly different paths than the `/api/v1/...` norm (e.g. `/api/users/:id/block`, `/api/albums`, `/api/subscriptions`). When wiring new features, confirm the exact path against `backend-spec.json`.

---

## 6. Real-time (`src/services/socket.ts`)

Singleton socket; auth header `{ token: accessToken }`; WebSocket transport; auto-reconnect. Returns `null` if no token.

**Listened:** `message.created` (chat upsert + inbox bump), `message.read`, `message.unsent`, `message.edited`, `typing` (peer typing), `call:invite` (IncomingCallSheet), `call:end` (call screen, e.g. `time_limit_reached`).
**Emitted:** `conversation:join { conversationId }`, `typing { conversationId, userId, isTyping }`.

---

## 7. Feature wiring

- **Location**: `requestForegroundPermissionsAsync()` in Browse → `updateLocation(lat,lng)` + included in grid query; backend returns fuzzed human distance. Auto-refresh every 3 min while focused.
- **Calls (`src/services/agora.ts`)**: `isAgoraAvailable` (native + APP_ID); `createCallEngine` → `joinChannel(token, channel, isVideo)`; controls `setMuted/setCameraEnabled/switchCamera/setSpeaker`; `leaveAndDestroy`. `initiateCall()` returns channel + token; call unlocks only after peer's first message.
- **Payments**: `createSubscription()` → `openRazorpayCheckout()` → `verifySubscription()` / add-on equivalents; updates plan in `authStore`. Guarded require for web.
- **Photos**: `expo-image-picker` in setup / edit-profile / verification; upload assumes a pre-signed URL (the file→URL upload step is **not yet implemented** on the client — see §8).
- **Toasts / offline**: `react-native-toast-message` (`showError/Success/Info`, `toastApiError`); `OfflineBanner` via `netinfo`; grid falls back to cache when offline.

---

## 8. Components (`src/components/`)

`UserCardTile` (memoized grid tile; online dot via `card.activity?.online`) · `Avatar` (photo + online dot + camera/upload states) · `badges.tsx` (`PlanBadge`, `VerifiedBadge`, `OnlineDot`) · `RangeSlider` (dual-thumb age/height range in filters) · `MessageTick` (sent/delivered/read ticks) · `ui.tsx` (`T`, `PillButton`, `ChipRow`, `Divider`) · `form.tsx` (`FormSection`, `FieldLabel`, `TextField`, `ChipSelect<T>`) · `UpgradeModal` (paywall) · `ReportSheet` · `IncomingCallSheet` · `LegalScreen` · `ErrorBoundary` · `OfflineBanner` / `NetworkError` · `Skeleton` (grid/list/chat) · `icons.tsx` (`NearMeLogo`, `Droplets`, `Flame`, `Bolt` — SVGs; no longer used by the tab bar, which now uses Ionicons).

**Theme** (`src/theme/`): dark (default, OLED black) + light palettes; plan badge colors; `theme.online` (green status dot); spacing/radius/font tokens; `useTheme()` → `{ theme, isDark, toggleTheme }`.

**Types** (`src/types/api.ts`): generated from `backend-spec.json` — `Self`, `UserCard`, `PublicProfile`, `ConversationSummary`, `Message`, `Photo`, `AlbumSummary`, `Call`, plus all enums. **Recent type changes:**
- `UserCard.activity?: { online: boolean; label: string | null } | null` — source of truth for the online dot (cards expose `lastActiveAt` as a human label like `"Active Now"`, profiles as raw ISO, so the boolean is read from `activity.online`). `PublicProfile` inherits it.
- `AlbumPhoto` now `{ id, url, order, createdAt }` (was `photoUrl`) — matches the backend serializer.

---

## 9. Gaps / TODOs (not yet wired)

1. ~~**Right Now** and **Interest** tabs — placeholder stubs.~~ ✅ Both implemented.
2. ~~**Photo upload** missing the file→URL step.~~ ✅ `uploadProfilePhoto` and `uploadAlbumPhoto` now do GCS upload-url → PUT → save. (Voice/video clip upload still posts a URL only.)
3. **Explore** modal — "set location" UI, no map.
4. **Interest → Views count for free users** — the backend gates `/discovery/views` to Gold+, so free users see a locked grid with no numeric count. Showing a count while keeping faces locked needs a count endpoint that bypasses the gate.
5. **Prompts/catalogs UI** — endpoints exist; selection UI not surfaced in edit-profile.
6. **City profiles (travel mode)** — API present, no UI.
7. **Album reorder** — endpoint wired, drag-and-drop gesture not implemented.
8. **E2E encryption** — `Message.ciphertext` field exists; client currently sends plaintext `content`.
9. **Legacy onboarding screens** (`phone.tsx`, `otp.tsx`) remain in the tree but are off the active Firebase flow — candidates for removal.

---

## See also
- `docs/technical/BACKEND.md` — the API this client consumes.
- `PLAYBOOK.md` — running the stack locally.
- `frontend/CLAUDE.md` — client-specific conventions.
