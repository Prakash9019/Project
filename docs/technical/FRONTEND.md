# Frontend — Technical Reference

**App:** NearMe — Expo / React Native mobile client for the Proximity Social platform.
**Audience:** Mobile engineers.
**Stack:** Expo SDK 56 · React Native 0.85 · React 19 · TypeScript · expo-router · Zustand · Socket.IO.

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
    phone.tsx              Phone + country picker → requestOtp()
    otp.tsx                6-digit OTP, resend cooldown → verifyOtp() → login
    intro.tsx              4-slide carousel
    setup.tsx              Multi-step profile completion
    terms.tsx / privacy.tsx  Legal (LegalScreen component)
  (tabs)/
    _layout.tsx            CustomTabBar (5 tabs)
    index.tsx              BROWSE — 3-col discovery grid
    right-now.tsx          Placeholder ("Coming soon")
    interest.tsx           Placeholder (views/taps)
    inbox.tsx              Conversations + albums row
    store.tsx              Plans + add-ons (Razorpay)
  profile/[id].tsx         Public profile detail
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
| Phone | `app/onboarding/phone.tsx` | E.164 input, hardcoded `COUNTRIES`, `requestOtp()` |
| OTP | `app/onboarding/otp.tsx` | 6-digit PIN, paste support, 30s resend cooldown, `verifyOtp()` |
| Setup | `app/onboarding/setup.tsx` | 4-step: name/age/gender → identity/orientation/intent → photo → finish |
| Browse | `app/(tabs)/index.tsx` | 3-col `UserCardTile` grid, location-gated, quick filters, pull-refresh, pagination, auto-refresh every 3 min |
| Inbox | `app/(tabs)/inbox.tsx` | Conversation rows + unread + call icons; `message.created` socket listener |
| Store | `app/(tabs)/store.tsx` | Plan cards (Free/Premium/Gold/Platinum) + billing-cycle tabs + add-ons → Razorpay |
| Profile | `app/profile/[id].tsx` | Public view; tap / shortlist / message / report / block |
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

**Endpoints wired up** (grouped): auth (request/verify/me/refresh/logout) · profile (`/me`, settings, location, photos, prompts, export, delete) · grid · conversations (start/list/messages/send) · calls (initiate/update/history) · discovery (taps, favorites) · safety (block/report/blocks) · verification (status/photo/face) · albums (CRUD + photos + reorder) · billing (subscriptions + add-ons + verify) · catalogs & prompts · public profile (`/users/:id`).

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

`UserCardTile` (memoized grid tile) · `ui.tsx` (`T`, `PillButton`, `ChipRow`, `Divider`) · `form.tsx` (`FormSection`, `FieldLabel`, `TextField`, `ChipSelect<T>`) · `UpgradeModal` (paywall) · `ReportSheet` · `IncomingCallSheet` · `LegalScreen` · `ErrorBoundary` · `OfflineBanner` / `NetworkError` · `Skeleton` (grid/list/chat) · `NearMeLogo` (SVG).

**Theme** (`src/theme/`): dark (default, OLED black) + light palettes; brand `#FF4458`; plan badge colors; spacing/radius/font tokens; `useTheme()` → `{ theme, isDark, toggleTheme }`.

**Types** (`src/types/api.ts`): generated from `backend-spec.json` (~350 types) — `Self`, `UserCard`, `PublicProfile`, `ConversationSummary`, `Message`, `Photo`, `AlbumSummary`, `Call`, plus all enums.

---

## 9. Gaps / TODOs (not yet wired)

1. **Right Now** and **Interest** tabs — placeholder stubs.
2. **Explore** modal — "set location" UI, no map.
3. **Photo/clip upload** — `addPhoto()` / `uploadVoiceClip()` / `uploadVideoClip()` expect a pre-signed URL; the **file→URL upload step is missing** (need to call `/me/upload-url` then PUT to GCS).
4. **Prompts/catalogs UI** — endpoints exist; selection UI not surfaced in edit-profile.
5. **City profiles (travel mode)** — API present, no UI.
6. **Album reorder** — endpoint wired, drag-and-drop gesture not implemented.
7. **E2E encryption** — `Message.ciphertext` field exists; client currently sends plaintext `content`.
8. **Hardcoded country list** in `phone.tsx`.
9. Possible leftover **mock data** references from the UI-only phase.

---

## See also
- `docs/technical/BACKEND.md` — the API this client consumes.
- `PLAYBOOK.md` — running the stack locally.
- `frontend/CLAUDE.md` — client-specific conventions.
