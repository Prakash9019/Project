# NearMe — Complete Feature Audit & "Coming Soon" Inventory

**Date:** 2026-08-08
**Scope:** Full application — navigation, Browse, Right Now, Interest, Inbox, 1:1 Chat, Groups, Albums, Store, Settings, Profile, Calls.
**Method:** Code-level trace of every visible action to its actual handler, API call, and backend implementation (not UI-only inspection). Subscription gating was *not* re-implemented here — only documented, per the prior task.

> Legend for **Status**: `Working` / `Restricted` (subscription-gated) / `Coming Soon` / `Partial` / `Dead` (non-functional) / `Unknown`.
> Legend for **Priority**: `P0` blocker · `P1` important · `P2` UX issue · `P3` coming soon / planned.

---

## A. Complete Feature Inventory

### A1. Navigation / App Shell

| Location | Feature | Purpose | Status | User Action | Behavior | Notes |
|---|---|---|---|---|---|---|
| `app/index.tsx` | Splash routing | Route to grid or onboarding | Working | App launch | Checks SecureStore token, revalidates via `refreshUser()` | |
| `app/(tabs)/_layout.tsx` | Tab bar (Browse/Right Now/Groups/Inbox/Store) | Primary nav | Working | Tap tab | `navigation.navigate` | No drawer/sidebar nav exists beyond tabs — `ProfileSidebar.tsx` is a slide-out profile panel, not app nav |
| `app/(tabs)/_layout.tsx` | Inbox/Groups unread badges | Unread counts | Working | Passive | Socket-fed counts | |
| `app/_layout.tsx:135-184` | Push-notification tap routing | Deep-link from FCM | Partial | Tap push | Works for `room_*`/conversation payloads only | |
| `app/_layout.tsx:195-279` | Realtime in-app toasts | Message/tap/call/room events | Working | Passive | Real socket listeners | |

### A2. Browse (Grid) — `app/(tabs)/index.tsx` + filters/map/explore

| Location | Feature | Purpose | Status | User Action | Behavior | Notes |
|---|---|---|---|---|---|---|
| index.tsx | Header avatar → ProfileSidebar | Open profile menu | Working | Tap | Opens sidebar | |
| index.tsx | "Explore more profiles" search bar | Open map explore | Working | Tap | `router.push('/map-explore')` | |
| index.tsx | Filter icon + badge | Open Filters modal | Working | Tap | `router.push('/filters')`, badge = active count | |
| index.tsx | "Online" / "Fresh" quick chips | Filter grid | Working | Tap | Merged into query, refetches | |
| index.tsx | "Interest" chip → inline Views/Taps | Inline panel | Working | Tap | Renders `ViewsList`/`TapsList` inline (Gold gate applies downstream) | |
| index.tsx | Location-permission / load-error retry | Recover empty state | Working | Tap | Re-requests permission / refetches | |
| index.tsx | "Featured Nearby" spotlight carousel | Boosted users | Working | Passive+tap | Real `GET /grid/spotlight` | |
| UserCardTile.tsx | Card tap → profile | Navigate | Working | Tap | `/profile/[id]` | |
| UserCardTile.tsx | Status badges (online/verified/plan/boosted/right-now/liked/shortlisted) | Visual indicators | Working (display) | Passive | Pure render | |
| filters.tsx | Distance slider | Radius | **Restricted** | Drag | 25km free / 100km Gold+ (`maxRadiusKm`) | |
| filters.tsx | Age/Height/Sort/Body-type/Gender/Intent/Tribes | Basic filters | Working | Tap/drag | Free tier | |
| filters.tsx | Active-recency / reply-rate toggles | Behavior filters | **Restricted** | Tap | Premium (30min window) / Gold (rest) | |
| filters.tsx | "Verified users only" | Verification filter | **Restricted** (Premium) | Tap | Locked → UpgradeModal | |
| filters.tsx | Advanced (education/occupation/etc) | Advanced filters | **Restricted** (Premium) | Tap | Locked → UpgradeModal | |
| filters.tsx | Apply | Save filters | Working | Tap | Strips gated fields client-side if not entitled | |
| map-explore.tsx | Map/Grid toggle, pins/clusters | Map browsing | Partial | Passive/drag | Requires native build; placeholder on web/Expo Go | |
| map-explore.tsx | Search location, recenter, "Search this area" | Explore controls | Working | Various | Geocodes, refetches | |
| map-explore.tsx | "View Profiles" CTA | Apply explore location | Working | Tap | Sets `exploreLocation`, returns to grid | |
| ProfilePreviewCard.tsx | "Message" / "Profile" | Act on map pin | Working | Tap | Real chat-start / nav | |
| explore.tsx (Travel mode) | Upgrade CTA | Gate travel mode | **Restricted** (Gold) | Tap | Routes to Store + UpgradeModal | |
| explore.tsx | Add/activate/list travel cities | Manage travel-mode cities | **Dead (bug)** | Type+tap | `api.ts` calls `/api/city-profiles*` (missing `/v1`); backend is at `/api/v1/city-profiles` → **404, swallowed silently** | **P0** |
| ProfileSidebar.tsx | "Friends" | — | **Coming Soon** | Tap | Toast only: "Friends is coming soon" | P3 |
| ProfileSidebar.tsx | Edit Profile / My Albums / Settings / Add-ons / Log Out | Nav | Working | Tap | Real routes/actions | |
| ProfileSidebar.tsx | "Safety & Security" / "Privacy Settings" | Nav | Partial | Tap | Both route to the same generic `/settings` — no distinct screens | P2 |
| ProfileSidebar.tsx | "Help Center" | External link | Working | Tap | `Linking.openURL` (target URL liveness unverified) | |
| ProfileSidebar.tsx | Online Status toggle | Hide activity | Working | Tap | Real `updateSettings` | |
| ProfileSidebar.tsx | Incognito Mode toggle | Privacy | **Restricted** (Gold) | Tap | Locked → UpgradeModal | |

### A3. Right Now — `app/(tabs)/right-now.tsx`

| Location | Feature | Purpose | Status | User Action | Behavior | Notes |
|---|---|---|---|---|---|---|
| right-now.tsx | Distance/Hosting/Position/Age filter chips | Sort/filter feed | Working | Tap | Client-side only | |
| right-now.tsx | "Learn More" (intro banner) | Explain feature | **Dead** | Tap | Opens create-status sheet, not info content | P2 |
| right-now.tsx | "Dismiss" (intro banner) | Hide banner | Partial | Tap | Local state only, not persisted — reappears next visit | P2 |
| right-now.tsx | FAB "Right Now" | Create status | Working | Tap | Opens create sheet | |
| right-now.tsx | Row tap | View profile / edit own | Working | Tap | `/profile/[id]` or opens sheet | |
| right-now.tsx | Message icon | Start chat | Working | Tap | Real `POST /chat/start` | |
| right-now.tsx | Info icon (sheet header) | Explain sheet | **Dead** | Tap | No `onPress` handler at all | P2 |
| right-now.tsx | Master switch (turn off) | Deactivate status | Working | Tap | Real `PATCH /me` | |
| right-now.tsx | "Hosting" toggle (in create sheet) | Mark hosting | **Dead (cosmetic)** | Toggle | Value never included in save patch — has zero effect | P2 |
| right-now.tsx | Category/Duration chips | Status details | Working | Tap | Included in save patch | |
| right-now.tsx | Start/Save button | Post status | Working | Tap | Real `PATCH /me`; falls back local-only on failure w/ toast | |
| right-now.tsx | Turn-off confirm modal | Confirm deactivate | Working | Tap | | |
| right-now.tsx | Pull to refresh | Reload feed | Working | Pull | Real `GET /discovery/right-now` | |

### A4. Interest (Views + Taps) — `app/(tabs)/interest.tsx`

| Location | Feature | Purpose | Status | User Action | Behavior | Notes |
|---|---|---|---|---|---|---|
| interest.tsx | Views/Taps tabs | Switch list | Working | Tap | Local state; red dot when taps exist | |
| ViewsList.tsx | Locked grid + "Unlock" | Gate profile viewers | **Restricted** (Gold+) — **client-side only** | Tap locked tile | Opens UpgradeModal | Backend `premiumFeature('viewed_me')` middleware is a documented **no-op passthrough** — not actually enforced server-side. **P1 security/business-logic gap.** |
| ViewsList.tsx | "Unlock All With Gold" | Deep link to Store | Working | Tap | `router.push('/(tabs)/store')` | |
| ViewsList.tsx | Viewer card tap (unlocked) | View profile | Working | Tap | `/profile/[id]` | |
| TapsList.tsx | Tap-back flame icon | Send tap back | Working, free-tier capped | Tap | Real `POST /discovery/taps`; 403 → UpgradeModal | Correctly enforces the 20-lifetime-cap rule |
| TapsList.tsx | Row tap | View sender profile | Working | Tap | `/profile/[id]` | |
| interest.tsx | Socket live updates | Bump new taps/views | Working | Passive | Real socket events | |

### A5. Public Profile — `app/profile/[id].tsx`

| Location | Feature | Purpose | Status | User Action | Behavior | Notes |
|---|---|---|---|---|---|---|
| profile/[id].tsx | Back / Star-Shortlist / "···" menu | Core actions | Working | Tap | Real APIs, interaction-capped | |
| profile/[id].tsx | Photo carousel | Browse photos | Working | Swipe | Lazy-loaded, no pagination dots | P2 |
| profile/[id].tsx | Verified/plan/availability badges | Static indicators | Working (display) | Passive | | |
| profile/[id].tsx | Voice/Video intro pill (MediaPill) | Play intro clip | **Dead** | Tap | No `onPress` handler at all | P1 |
| profile/[id].tsx | Albums grid, locked album unlock-via-message | View shared albums | Working | Tap | Real API | |
| profile/[id].tsx | "See All" media/links, media lightbox | Browse shared content | Working | Tap | Real nav + `MediaViewer` | |
| profile/[id].tsx | Shared link card | Open URL | Working (silent failure) | Tap | `Linking.openURL` swallows errors | P2 |
| profile/[id].tsx | "Groups in common" chips | Nav to mutual room | Working | Tap | `/rooms/[id]` | |
| profile/[id].tsx | Inline composer, flame/tap, chat bubble | Message/like/chat | Working, interaction-capped | Type/tap | Real APIs; 403 → UpgradeModal | |
| profile/[id].tsx | "Report" menu item | Report user | **Dead (bug)** | Tap → submit | Calls `/api/users/:id/report` — missing `/v1/safety` prefix; real route is `/api/v1/safety/users/:id/report` → **404s** | **P0** |
| profile/[id].tsx | "Block" menu item | Block user | **Dead (bug)** | Tap → confirm | Same missing-prefix bug → **404s** | **P0** |

### A6. Inbox — `app/(tabs)/inbox.tsx`

| Location | Feature | Purpose | Status | User Action | Behavior | Notes |
|---|---|---|---|---|---|---|
| inbox.tsx | Inbox/Albums toggle | Switch view | Working | Tap | Toggles list vs album grid | |
| inbox.tsx | Search conversations | Filter | Working | Type | Client-side only | |
| inbox.tsx | Filter chips (All/Unread/Pinned/Online) | Narrow list | Working | Tap | Client-side | |
| inbox.tsx | Tap row → open chat | Nav | Working | Tap | `/chat/[id]` | |
| inbox.tsx | Long-press → multi-select | Bulk actions | Working | Long-press | Haptic + selection | |
| inbox.tsx | Pin selected | Pin chat to top | **Restricted** (Gold+, `pinChats`) | Tap | Real `POST /conversations/:id/pin`; 403 → UpgradeModal | `pin_limit_reached` error is silently swallowed with no user feedback — **P2** |
| inbox.tsx | Mute selected | Silence notifications | **Coming Soon** | Tap | Toast-only stub, no API/backend route exists at all | P3 |
| inbox.tsx | Archive/unarchive | Move thread | Working | Tap | Real `POST /conversations/:id/archive` | |
| inbox.tsx | Delete conversation(s) | Remove thread | Working | Tap → confirm | Real `DELETE /conversations/:id` | |
| inbox.tsx | View archived | Archived-only list | Working | Tap | Real query | |
| inbox.tsx | Create album ("+") | New album | Working (nav) | Tap | `/albums/create` | |
| inbox.tsx | Online indicator | Presence dot | Partial | Passive | Client heuristic (last-active < 5min), not a live socket check on this screen | P2 |
| inbox.tsx | Call availability glyphs | Show call state | Working (display) | Passive | Reflects `audioCallEnabled`/`videoCallEnabled` | |

### A7. 1:1 Chat — `app/chat/[id].tsx` + `src/components/chat/*`

| Location | Feature | Purpose | Status | User Action | Behavior | Notes |
|---|---|---|---|---|---|---|
| chat/[id].tsx | Open conversation, pagination | Core messaging | Working | Navigate/scroll | Real cursor-paged fetch | |
| chat/[id].tsx | Swipe-to-reply | Quick reply | Working | Swipe right | Sets `replyTo` | |
| chat/[id].tsx | Long-press context menu | Reply/Copy/Forward/Star/Pin/Edit/Translate/Save/Share/Select/Delete/Report/Info | See rows below | | | |
| " → Forward | Forward single/batch | Working | Tap | Real `POST .../forward` | |
| " → Star/Unstar | Bookmark | Working | Tap | Real `/messages/:id/star` | |
| " → Pin | Pin banner | Working | Tap | Real, socket `message.pinned` | |
| " → Edit | Edit own text (5-min window) | **Restricted** (Gold, **frontend-only gate**) | Tap | Backend has NO plan check, only the 5-min window — a non-Gold user could bypass via direct API call | **P1 security gap** |
| " → Translate | Machine-translate message | **Dead** | Tap | Calls Google Translate REST **directly from the client** using an optional env key instead of the real Premium-gated backend endpoint that already exists (`chat.controller.ts`); fails "Translation unavailable" if key unset | **P1** |
| " → Delete for Me/Everyone | Unsend | **Restricted** (Premium: pre-read only; Gold+: anytime) | Tap | Real `DELETE .../messages/:id`; 403 → alert | |
| " → Message Info | Delivery/read timeline | Partial (paywall bypass) | Tap (own msg) | Shows raw `readAt` regardless of sender's plan — inline blue tick is correctly hidden for free users but Info sheet leaks the same data | **P1** |
| Reactions (quick row + picker) | React | Working | Tap/long-press | Optimistic + real API | |
| Image/video/voice attachments | Media sharing | Working | Composer | Upload+send, in-app playback, speed control (1x/1.5x/2x) | |
| LocationPicker → static pin | Share location | Working | Tap | Real | |
| LocationPicker → "Live Location" | Live/streaming location | **Coming Soon** | Tap duration chip | Toast: "Live location coming soon" | P3 |
| View Once photo | Self-destruct photo | **Restricted** (Premium+, daily cap) | Attach | Real, capped 10/day | |
| Saved Replies (templates) | Insert saved text | **Restricted** (Premium+, `messageTemplates>0`) | Attach | Real `GET /conversations/templates` | |
| Search in chat | Find messages | Partial | Tap search icon | Client-side over already-loaded messages only — no full-history backend search | P2 |
| Scroll-to-bottom | Jump to latest | Working | Tap | | |
| ChatLock | PIN/biometric lock | Working, local-only | Header ⋮ | AsyncStorage PIN (not cryptographic), no server sync | P2 |
| Disappearing Messages | Auto-delete window | Working | Header ⋮ | Real `PATCH /conversations/:id` | |
| Encryption info sheet | "Secured" messaging info | Working but **misleading copy** | Header padlock | Says "secured" implying E2E; actually TLS-in-transit only | **P1 (trust/compliance issue)** |
| Call buttons (audio/video) | Start Agora call | Always visible, gated by availability | Tap header icon | Disabled until peer replied once + peer availability + native build | Per CLAUDE.md rule 3 — correct |
| chat/media.tsx | Media/Links/Docs tabs | Browse shared content | Partial | Navigate | Only classifies the most recently loaded 100 messages — older shared media invisible | P2 |
| starred-messages.tsx | Cross-chat starred list | Working | Navigate | Real `GET /messages/starred` | |

### A8. Groups / Rooms

| Location | Feature | Purpose | Status | User Action | Behavior | Notes |
|---|---|---|---|---|---|---|
| create-group/details.tsx, members.tsx | Create group, add members | Working | Fill+create | Real `POST /rooms` + bulk invite | |
| rooms/join/[code].tsx | Join via invite link/code | Working | Tap link | Real preview + join | |
| groups.tsx | Discover/join public room, accept/decline invites | Working | Tap | Real API + socket events | |
| RoomHeader.tsx | **Group audio/video calls** | Group calling | **Dead — entire feature absent** | N/A | No call icon anywhere in room header/menu; zero Agora/call references in the rooms module | **P1 (feature gap vs 1:1 chat)** |
| rooms/[id].tsx | Text/image/video/voice/GIF/docs/location | Group messaging | Working | Composer | Full parity with 1:1 media handling | |
| VoiceRecorder / AudioPlayer | Voice messages + speed | Working | Hold mic / tap play | Shared component | |
| ContextMenu (long-press) | Reply/Copy/Forward/Star/Pin/Edit/Save/Share/Select/Delete/Report/Info | Working per-item | Long-press | Real handlers | |
| ContextMenu → Edit | Edit own message | **Restricted** (Gold, **frontend-only**, same pattern as 1:1) | Tap | Backend has no plan check | **P1 security gap** |
| MessageBubble.tsx | Swipe-to-reply | Working | Swipe | | |
| rooms/info.tsx → "Pinned Messages" row | View pinned messages | **Dead** | Tap | Shows a count but tapping just navigates back to the chat — no pinned-list view opens | **P1**; count also undercounts (only scans first 50 messages) |
| rooms/info.tsx | Rename/description/photo, mute, transfer ownership, role mgmt/kick, leave/report/delete | Working | Various | Real APIs | |
| rooms/media.tsx | Media/Links/Docs gallery | Working | Tabs | Real `GET /:roomId/media` | |
| rooms/members.tsx | Full member list, search | Working | Open | Paginated | |
| GifPicker.tsx | GIF sharing (KLIPY) | Working, config-gated | Attach → GIF | Shows "coming soon" only if `EXPO_PUBLIC_KLIPY_API_KEY` unset — real feature once key configured | P3 (env-dependent) |
| EmojiPicker.tsx | Reaction emoji picker | Working | Long-press → "+" | | |
| RoomFilterSheet.tsx | Discover filters | Working | Filter icon | Server-side city + client-side sort/member-floor | |

### A9. Albums

| Location | Feature | Purpose | Status | User Action | Behavior | Notes |
|---|---|---|---|---|---|---|
| albums/index.tsx | List/create albums (plan-capped 1/3/5/∞) | **Restricted** for count | Tap "+" | Real API; 403 at cap → UpgradeModal | |
| albums/index.tsx | Edit/Delete album | Working | Tap ⋯ | Real PATCH/DELETE | |
| albums/index.tsx | "Shared with Me" section | Show albums shared by others | **Dead — always empty** | Passive | Reads a legacy `PrivateAlbum`/`PrivateAlbumGrant` model that the new `Album` share flow never writes to | **P1** |
| albums/create.tsx | Create via camera/gallery photo | Working | Tap option | Real upload | |
| albums/create.tsx | Create via "Video Library" | **Dead/Partial** | Tap "Video Library" | Video uploads through a photo-only pipeline; no server MIME validation; produces a broken/blank thumbnail (image component can't render video) — no player anywhere | **P1** |
| albums/[id].tsx | Add photos, view grid | Working, photo-limit gated | Tap | Real API | |
| albums/[id].tsx | Photo viewer | View photo | **Missing capability** | Tap photo | Ad-hoc modal — no zoom/swipe/download; doesn't reuse the existing shared `PhotoViewer` component | P2 |
| albums/edit.tsx | Rename, cover, reorder, remove photo, delete | Working | Various | Real APIs | |
| albums/edit.tsx | "Shared with (N)" pill | Show share count | **Dead — hardcoded** | Tap | Literal hardcoded `"Shared with (0)"` string, never queries real data | **P1** |
| Album privacy setting | Control who can view (everyone/matches/chats_only/nobody) | **Dead — no UI** | — | Backend fully supports a `privacy` field; **no screen anywhere ever sets it** | **P1** |
| ShareAlbumSheet.tsx | "Copy link" | Copy shareable album link | **Dead** | Tap | Shows a fake success toast; no clipboard call, no deep link exists at all | **P0 (misleads user)** |
| ShareAlbumSheet.tsx | "Send to Chat" | Share album into a chat | Partial | Tap conversation | Sends a plain text message ("📸 Shared an album…") — no real album attachment type; recipient can't tap through | P1 |
| Photo viewers (chat + albums, all) | Zoom/pan/save/download, screenshot detection | **Not implemented anywhere** | — | No gesture handling or save button exists in any viewer; no screenshot detection code | P2 |

### A10. Store — `app/(tabs)/store.tsx`

| Location | Feature | Purpose | Status | User Action | Behavior | Notes |
|---|---|---|---|---|---|---|
| store.tsx | Billing cycle toggle | Switch price cycle | Working | Tap | Local state, re-renders prices | |
| store.tsx | Plan cards (Free/Premium/Gold/Platinum) | Show tier perks/price | Working | View | Sourced from `src/lib/plans.ts`, matches backend `PLAN_LIMITS` | |
| store.tsx | "Upgrade to X" CTA | Purchase plan | Working | Tap | Real Razorpay checkout → `verifySubscription`; covered by backend test suite (`revenue.test.ts`) | Genuinely wired, not stubbed |
| store.tsx | Add-on purchase (chat slots, call minute top-ups) | One-off purchase | Working | Tap price | Real Razorpay → `verifyAddOnPurchase` | |
| store.tsx | Cancel Subscription | Cancel auto-renew | Working | Tap → confirm | Real API, retains access until `expiresAt` | |
| store.tsx | Compare All Features matrix | Info toggle | Working | Tap chevron | Static local data, correct expand/collapse | |
| payments.ts | Razorpay web guard | Prevent checkout on web | Working | N/A | Correctly shows "mobile app only" alert on web | |

### A11. Settings — `app/settings/*`

| Location | Feature | Purpose | Status | User Action | Behavior | Notes |
|---|---|---|---|---|---|---|
| settings/index.tsx | Get verified row | Nav to verification | Working | Tap | Real, live `isVerified` state | |
| settings/index.tsx | Discoverable / Show distance / Pause incoming | Free toggles | Working | Toggle | Real `updateSettings`, optimistic+rollback | |
| settings/index.tsx | Verified-users-only filter | Filter toggle | **Restricted** (Premium+) | Tap | Locked → UpgradeModal | |
| settings/index.tsx | Availability (Groups/Audio/Video accept) | Callability | Working | Toggle | Real `PATCH /me` | |
| settings/index.tsx | Incognito / Hide active / Hide last-seen / Hide exact distance | Privacy | **Restricted** (Gold+) | Tap | Locked → UpgradeModal | |
| settings/index.tsx | Block offensive language / Require profile completeness / Discreet mode / Show orientation | Safety toggles | Working | Toggle | Real backend fields confirmed | |
| settings/index.tsx | AI Icebreakers/Reply Suggestions/Compatibility/Daily Top10/Profile Optimizer | AI toggles | **Restricted** (Platinum) | Tap | Toggle persists; whether the AI features themselves are implemented elsewhere was **not verified** — flag as Unknown | **Unknown** |
| settings/index.tsx | Starred Messages row | Nav | Working | Tap | Real route | |
| settings/index.tsx → notifications.tsx | Notification preference toggles (9 switches) | Notification prefs | **Partial** | Toggle | Persist to **AsyncStorage only** — no backend endpoint found to sync/enforce server-sent push notification gating | **P1** |
| settings/index.tsx | Dark mode toggle | Theme | Working | Toggle | Real ThemeContext | |
| settings/index.tsx | Export my data | GDPR export request | Working (request only) | Tap | Real API call; async fulfillment mechanism not traced | |
| settings/index.tsx | Delete account | Account deletion | Working | Type "DELETE" → confirm | Real API + logout | |
| settings/index.tsx | Log out | Sign out | Working | Tap | Real | |

### A12. Verification / Onboarding / Calls

| Location | Feature | Purpose | Status | User Action | Behavior | Notes |
|---|---|---|---|---|---|---|
| verification.tsx | Phone/Email/College verification status | Working | View | Real `getVerificationStatus()` | |
| onboarding/* | Phone/Email/Google auth flow | Working | Various | Matches CLAUDE.md contract | Not deep-audited beyond nav graph |
| call/[id].tsx | Audio/video call UI (mute/camera/speaker/switch/end) | Working | Various | Real Agora SDK; `agoraToken` fully wired end-to-end | **CLAUDE.md's "Known deferred items" note about `agoraToken` is stale — it's already implemented.** |
| call/[id].tsx | Daily call-limit-reached card | Free-tier cutoff | Working | Auto-shown | Ends call, routes to Store | |
| call/[id].tsx | Connect error / 15s timeout card | Failed join handling | Working | Retry/End | | |
| UpgradeModal.tsx | Universal paywall CTA | Working | Tap "See all plans" | Routes to Store; used consistently across 9+ screens | Plan prices are **hardcoded separately** from `src/lib/plans.ts` — duplication risk, not a bug today | P2 |
| ReportSheet.tsx | Report user/message (in-chat) | Working | Select reason → submit | Real `reportUser()` call | (Distinct from the broken profile-screen Report/Block — see A5) |

---

## B. Fully Working Features (representative — not exhaustive, see tables above)

Core messaging (send/receive/pagination/reactions/forward/star/pin/delete/reply/swipe-reply), media sharing (image/video/voice with playback speed), group creation/join/roles/media, album CRUD, grid browsing + filters (base tier), Right Now create/browse/deactivate, Interest taps, Store purchase flow (Razorpay fully wired, not stubbed), Settings toggles (except notification prefs), account deletion/export/logout, verification status, audio/video 1:1 calling (Agora fully wired), UpgradeModal paywall triggers.

## C. Subscription-Gated Features

| Feature | Required Plan | Enforcement | Upgrade Flow |
|---|---|---|---|
| Distance radius >25km | Gold+ | Client + server (`maxRadiusM`) | Yes |
| Active-recency / reply-rate filters | Premium/Gold | Client-side strip | Yes |
| Verified-users-only filter | Premium+ | Client-side strip | Yes |
| Advanced filters (education/occupation/etc) | Premium+ | Client-side strip | Yes |
| Travel/Explore mode | Gold+ | Client gate | Yes (feature itself is **broken**, see D0/P0) |
| Incognito mode, hide active/last-seen/distance | Gold+ | Real toggle, server field | Yes |
| Pin conversations | Gold+ (`pinChats`) | Real server enforcement | Yes |
| Message edit | Gold | **Frontend-only** — no backend plan check | N/A (bypassable) |
| Delete for Everyone (post-read) | Gold+ (Premium = pre-read only) | Real server enforcement | Yes |
| View Once photos | Premium+ | Real, daily-capped | Yes |
| Saved Reply templates | Premium+ (`messageTemplates>0`) | Real | Yes |
| Album count cap | Free=1 / Premium=3 / Gold=5 / Platinum=∞ | Real server 403 | Yes |
| "Who viewed me" (Interest → Views) | Gold+ | **Client-side only** — backend middleware is a no-op passthrough | Yes, but **not actually enforced** |
| AI features (Icebreakers, Reply Suggestions, etc.) | Platinum | Toggle persists; underlying feature implementation unverified | Yes |
| Plans/pricing themselves | N/A | Real Razorpay integration, verified server-side | N/A |

No changes were made to any of this gating logic.

## D. Coming Soon Features

| Feature | Location | Current UI | What Happens | Intentional? |
|---|---|---|---|---|
| Mute chat | `inbox.tsx:156-159` | Mute icon in multi-select bar | Toast: "Muting chats is coming soon!" — no API/backend route exists | Yes |
| Friends | `ProfileSidebar.tsx:74` | Menu item | Toast: "Friends is coming soon" | Yes |
| Live Location sharing | `LocationPicker.tsx:212-234` | Duration chip in location sheet | Toast: "Live location coming soon" (static pin sharing works) | Yes |
| GIF picker | `GifPicker.tsx:269-277` (rooms) | Full picker UI | Shows "coming soon" placeholder only when `EXPO_PUBLIC_KLIPY_API_KEY` env var is unset — otherwise fully functional | Config-dependent, not a true gap |
| Message action "(soon)" suffix | `rooms/ContextMenu.tsx:194-206` | Dims item + "(soon)" label | Dormant capability — UX is wired but no current caller actually passes `disabled:true` | Unused infrastructure, not user-facing today |

## E. Partially Implemented Features

| Feature | What Works | What's Missing/Broken |
|---|---|---|
| Push notification deep-link routing | Room/conversation payloads route correctly | Other notification types untraced |
| Chat search | Client-side search over loaded messages | No full-history backend search |
| Chat media tab | Shows recent shared media | Only classifies most recently loaded 100 messages — older media invisible |
| Chat Message Info (read receipts) | Shows delivery/read timeline | Leaks read status to free-tier senders even though inline blue tick correctly hides it — paywall bypass |
| Notification preference toggles | UI toggles and persists locally | AsyncStorage-only, no backend sync — doesn't actually gate server push |
| Map explore | Works on native build | Falls back to placeholder on web/Expo Go |
| Album photo viewer | Displays photos | No zoom/swipe/download; doesn't reuse shared `PhotoViewer` component |
| Album "Send to Chat" share | Sends a message into the chat | Plain text only, no real album-attachment type, recipient can't tap through |
| Video Library album creation | Upload succeeds | Runs through photo-only pipeline → broken/blank thumbnail, unplayable, no server MIME validation |
| Message edit (1:1 + groups) | 5-minute window + ownership enforced | Gold-plan requirement is **frontend-only** — not enforced server-side |
| "Who viewed me" gating | UI correctly locks for free/Premium users | Backend middleware (`premium.ts`) is a documented no-op passthrough |
| Chat encryption info copy | Sheet displays and functions correctly | Copy claims "secured" messaging, implying E2E, when it's actually TLS-in-transit only |
| Backend translation adapter | Endpoint exists and is Premium-gated | Client bypasses it entirely, calling Google Translate directly instead |
| Backend AI verification / image moderation / Stripe / geocoding adapters | Dev-mode stubs work for local testing | Production integrations are explicit TODOs (auto-approve verification, always-succeed payments, echo-only translation) |

## F. Dead / Non-Functional Buttons

| # | Feature | Location | Priority |
|---|---|---|---|
| 1 | Report user (profile screen) | `frontend/app/profile/[id].tsx` → `api.ts` (`reportUser`, missing `/v1/safety` prefix) | **P0** |
| 2 | Block user (profile screen) | `frontend/app/profile/[id].tsx` → `api.ts` (`blockUser`, missing `/v1/safety` prefix) | **P0** |
| 3 | Travel-mode city profiles (add/activate/list) | `frontend/app/explore.tsx` + `api.ts:850-861` (missing `/v1` prefix) | **P0** |
| 4 | Album "Copy link" | `frontend/src/components/ShareAlbumSheet.tsx:62-65` — fake success toast, no-op | **P0** (actively misleads user) |
| 5 | "Right Now" info icon | `right-now.tsx` create-sheet header — no `onPress` at all | P2 |
| 6 | "Right Now" Learn More | `right-now.tsx` — opens create sheet instead of info | P2 |
| 7 | "Right Now" Hosting toggle | `right-now.tsx` — value never saved, purely cosmetic | P2 |
| 8 | Voice/video intro pill | `profile/[id].tsx` (MediaPill) — no `onPress` handler | P1 |
| 9 | Chat "Translate" | `chat/[id].tsx:1775-1808` — bypasses working backend endpoint, calls client-side Google Translate directly, fails without an env key | P1 |
| 10 | Group audio/video call | Entirely absent from `RoomHeader.tsx` — no icon, no backend wiring | P1 |
| 11 | Rooms "Pinned Messages" row | `rooms/info.tsx:566-571` — navigates back instead of opening a list | P1 |
| 12 | Albums "Shared with Me" section | `albums/index.tsx` — always empty, reads a legacy unused model | P1 |
| 13 | Albums "Shared with (0)" pill | `albums/edit.tsx:212-215` — hardcoded literal string | P1 |
| 14 | Album privacy setting | No UI anywhere despite full backend support | P1 |
| 15 | Inbox pin-limit error | `inbox.tsx` — 403 `pin_limit_reached` silently swallowed, no feedback shown | P2 |

## G. Production Bugs (should work, currently broken)

1. **Report/Block on profile screen 404** — wrong API path prefix (`/api/users/...` vs real `/api/v1/safety/users/...`). Safety-critical. **P0.**
2. **Travel mode entirely non-functional** — wrong API path prefix (`/api/city-profiles` vs real `/api/v1/city-profiles`), errors silently swallowed. Paid (Gold) feature customers can't use what they paid for. **P0.**
3. **Album "Copy link" fabricates success** — no clipboard write, no real link exists; user believes they shared something they didn't. **P0.**
4. **"Who viewed me" not enforced server-side** — Gold-gated feature is bypassable via direct API call since `premiumFeature('viewed_me')` middleware is a no-op. **P1 (revenue leak).**
5. **Message-edit Gold-gating is bypassable** — same class of bug as #4, in both 1:1 chat and rooms. **P1 (revenue leak).**
6. **Chat Message Info leaks read receipts to free users** — defeats the intended paid-tier blue-tick perk. **P1 (revenue leak).**
7. **Chat encryption copy is misleading** — states messages are "secured" without clarifying it's TLS, not end-to-end. **P1 (trust/compliance risk).**

## H. Unknown Features

- **AI features** (Icebreakers, Reply Suggestions, Compatibility, Daily Top 10, Profile Optimizer) — settings toggles persist correctly and are Platinum-gated, but whether the underlying AI functionality is actually implemented anywhere else in the app was not verified in this pass. Recommend a follow-up trace before relying on this being "done."
- **Help Center URL** (`https://help.nearme.app`) — link target liveness not verified.
- **Data export fulfillment mechanism** — request API confirmed real, but the async delivery path (email? in-app?) wasn't traced.

---

## I. Priority List

```
P0
1. Fix Report/Block 404 on profile screen (wrong API path prefix — safety-critical)
2. Fix Travel Mode 404s across add/activate/list city profiles (wrong API path prefix — paid feature entirely broken)
3. Fix Album "Copy link" fabricating a success toast with no real action taken (actively misleads users)

P1
1. Enforce "Who viewed me" Gold gate server-side (currently a no-op passthrough — revenue leak)
2. Enforce message-edit Gold gate server-side in both 1:1 chat and rooms (currently frontend-only — revenue leak)
3. Fix Chat Message Info leaking read receipts to free-tier senders (defeats paid blue-tick perk — revenue leak)
4. Correct or remove misleading "secured" messaging copy in chat encryption info sheet (trust/compliance risk)
5. Wire Chat Translate to the existing (already-built) backend endpoint instead of the broken client-side Google Translate call
6. Build Group audio/video calling, or explicitly scope it out — currently a total feature gap vs 1:1 chat
7. Fix Rooms "Pinned Messages" row to actually open a pinned-messages view
8. Fix Albums "Shared with Me" (always empty — reads an unused legacy model)
9. Fix Albums "Shared with (N)" count (hardcoded to 0)
10. Add UI for the Album privacy setting the backend already fully supports
11. Fix "Video Library" album creation (broken thumbnail, unplayable video)
12. Wire notification preference toggles to a real backend, or clearly label them as local-device-only
13. Fix voice/video intro pill on profile screen (no handler at all)
14. Add zoom/pan/download to photo viewers app-wide (currently none anywhere)
15. Fix Album "Send to Chat" to send a real tappable album attachment instead of plain text

P2
1. "Right Now" Hosting toggle in create sheet — persist the value or remove the control
2. "Right Now" info icon and "Learn More" — wire real content instead of no-op / wrong-action
3. Inbox pin-limit-reached error — surface user feedback instead of silently swallowing
4. ProfileSidebar "Safety & Security" / "Privacy Settings" — split into distinct screens or relabel as one
5. Chat search — extend beyond client-side loaded-message search, or label the limitation
6. Chat media tab — classify full shared-media history, not just the last 100 loaded messages
7. Profile photo carousel — add pagination indicators
8. UpgradeModal pricing — source from src/lib/plans.ts instead of a hardcoded duplicate

P3
1. Mute Chat — intentional Coming Soon, no backend exists yet
2. Friends — intentional Coming Soon
3. Live Location sharing — intentional Coming Soon
```

---

## Sidebar / Navigation Tree (as audited)

```
App Shell
├── Tab: Browse (Grid)
│   ├── Header avatar → ProfileSidebar
│   │   ├── Friends [Coming Soon]
│   │   ├── Edit Profile / My Albums / Settings / Add-ons / Log Out [Working]
│   │   ├── Safety & Security / Privacy Settings [Partial — both → generic Settings]
│   │   ├── Help Center [Working, external link]
│   │   ├── Online Status toggle [Working]
│   │   └── Incognito Mode toggle [Restricted: Gold]
│   ├── Search → Map Explore [Working, native-only for map pins]
│   ├── Filters [Working base tier / Restricted advanced]
│   ├── Interest inline chip (Views/Taps) [Working / Restricted Views]
│   ├── Featured Nearby spotlight [Working]
│   └── Card → Public Profile
│       ├── Star/Shortlist, Message, Tap, Chat [Working, interaction-capped]
│       ├── Voice/Video intro pill [Dead]
│       ├── Albums / Media / Links / Groups-in-common [Working]
│       └── ··· menu → Report [Dead/404] / Block [Dead/404]
├── Tab: Right Now
│   ├── Filter chips [Working]
│   ├── FAB → Create sheet [Working, Hosting toggle dead-cosmetic, info icon dead]
│   └── Row → Profile / Message [Working]
├── Tab: Groups
│   ├── Discover/Join, Create Group [Working]
│   └── Room
│       ├── Messaging + media + voice [Working]
│       ├── Call button [Dead — feature absent]
│       ├── Context menu (reply/forward/star/pin/edit*/delete/report) [Working, *Edit gate frontend-only]
│       └── Info → Pinned Messages [Dead], Members/Media/Rename/Roles/Leave [Working]
├── Tab: Inbox
│   ├── Search / Filter chips [Working]
│   ├── Multi-select → Pin [Restricted: Gold] / Mute [Coming Soon] / Archive / Delete [Working]
│   ├── Albums toggle → Album list
│   │   ├── Create/Edit/Delete album [Working]
│   │   ├── Shared with Me [Dead — always empty]
│   │   └── Share sheet → Copy link [Dead/fake] / Send to Chat [Partial]
│   └── Row → 1:1 Chat
│       ├── Composer (text/image/video/voice/GIF/location/view-once/templates) [Working, Restricted where noted]
│       ├── Context menu → Translate [Dead], Edit* [frontend-gate], others [Working]
│       ├── Call buttons [Working, availability-gated]
│       └── ⋮ → Disappearing msgs / Chat Lock / Encryption info* [*misleading copy]
├── Tab: Store
│   └── Plan cards, Add-ons, Cancel, Compare matrix [All Working — real Razorpay]
└── Interest tab (separate from Browse's inline panel): Views [Restricted, client-only enforcement] / Taps [Working]
```

---

## Methodology Note

Four parallel code-tracing passes were run:
1. Navigation, Browse, Right Now, Interest, Public Profile
2. Inbox, 1:1 Chat, Groups/Rooms, Albums
3. Store, Settings, Onboarding, Verification, Calls, UpgradeModal, Report/Block sheets
4. Full-repo grep sweep for "coming soon" / TODO / not-implemented / empty-handler patterns (frontend + backend)

Every finding above was traced to its actual `onPress`/handler, the API call it makes (`frontend/src/services/api.ts`), and cross-referenced against the real backend route/controller — not inferred from UI appearance alone. No subscription-gating logic was modified. No large-scale fixes were implemented; this document is the audit deliverable only.
