# NearMe — Perceived Performance & UX Polish Audit

> **Date:** 2026-07-20 · **Scope:** `frontend/` (Expo SDK 56, RN 0.85, New Arch + Hermes enabled)
> **Goal:** Make the app *feel* like Tinder/WhatsApp/Instagram even on free-tier (Render) backend latency.
> Backend speed is out of scope — every finding here is about perceived smoothness, responsiveness, and native feel.

**Dependency baseline (important):** `expo-image`, `@shopify/flash-list@2.0.2`, `react-native-reanimated@4.3.1`, `react-native-gesture-handler@2.31`, `expo-haptics` are ALL already installed. Nothing below requires a risky new native dependency except `@gorhom/bottom-sheet` (recommended). This audit is about **usage**, not missing libraries.

**Legend:** Priority P0 (ship-blocker feel), P1 (major), P2 (polish). Impact ★1–5.

---

## 1. STARTUP & NAVIGATION

### F1 — Hard-coded 1400ms splash delay + auth gating before first navigation — **P1 ★★★★☆**
- **Problem:** `app/index.tsx:45` — `setTimeout(route, 1400)` purely for the logo animation, and `route()` then `await refreshUser()` (GET `/auth/me`) before `router.replace`. Time-to-interactive = 1.4s + a Render cold-start round-trip.
- **Why it feels bad:** every cold open sits on a logo for multiple seconds even for a logged-in user.
- **Fix:** run auth check in parallel with the animation (`Promise.all([minDelay(600), refreshUser()])`); better, navigate immediately on cached token and reconcile `refreshUser()` in the background.

### F2 — User object is never persisted → splash blocks on network — **P1 ★★★★☆**
- **Problem:** `src/store/authStore.ts:57-68` — no zustand `persist`; `getMe()` runs on every launch before routing (`app/index.tsx:34`). Only `filterStore` persists; `gridStore`/`chatStore` hand-roll AsyncStorage caches but the user doesn't.
- **Fix:** persist `user` with `zustand/persist` + AsyncStorage; route from persisted user instantly, revalidate in background. Combined with F1 this makes cold open feel instant.

### F3 — Double splash screen (native → JS re-animated logo) — **P1 ★★★☆☆**
- **Problem:** native splash hides at `app/_layout.tsx:343-354`, then `app/index.tsx:13-56` renders a *second* full-screen logo animating from scale 0.8/opacity 0. Logo → flash → logo again.
- **Fix:** keep native splash up until the routing decision (`SplashScreen.hideAsync()` after route), drop the JS splash, or make it pixel-continuous with the native one.

### F4 — Tabs: no `freezeOnBlur` / `lazy`; background tabs keep re-rendering — **P1 ★★★★☆**
- **Problem:** `app/(tabs)/_layout.tsx:151-155` — no `lazy`/`freezeOnBlur`. All 5 tabs stay live; socket-driven unread updates (`_layout.tsx:121-149`) re-render backgrounded tabs; Browse's 3-min GPS interval (`index.tsx:172`) fires while you're elsewhere.
- **Fix:** `screenOptions={{ freezeOnBlur: true, lazy: true }}`; gate the GPS interval on `useIsFocused`.

### F5 — Browse double-fetches grid + double GPS fix on first mount — **P2 ★★★☆☆**
- **Problem:** `app/(tabs)/index.tsx:161-163` (mount effect) + `:169-175` (`useFocusEffect`) both call `acquireAndLoad` on launch → two GPS fixes, two `fetchGrid` calls, possible visible grid reshuffle.
- **Fix:** drop the mount effect; rely on `useFocusEffect` with a first-run ref guard.

### F6 — Splash→tabs uses `slide_from_right` transition — **P2 ★★☆☆☆**
- **Problem:** `app/_layout.tsx:284-293` — the app-launch reveal slides in like a push.
- **Fix:** `animation: 'fade'` (or `'none'`) on `index` and `(tabs)` screen entries.

### F7 — Theme flash for light-mode users — **P2 ★★☆☆☆**
- **Problem:** `src/theme/ThemeContext.tsx:17-23` — initializes `dark`, reads AsyncStorage in `useEffect` → dark→light flash on every cold start.
- **Fix:** gate first render on the storage read (combine with the font gate) or move theme persistence to a synchronous store (MMKV).

### F8 — 10 font weights block first render — **P2 ★★☆☆☆**
- **Problem:** `app/_layout.tsx:330-349` awaits Outfit + Plus Jakarta Sans × 5 weights before rendering anything.
- **Fix:** embed fonts natively via the `expo-font` config plugin `fonts` array so they're bundled (instant) instead of runtime-loaded.

### F9 — Store tab has no skeleton — **P2 ★★☆☆☆**
- **Problem:** `app/(tabs)/store.tsx:187` — plan cards pop in after fetch; only in-button spinners exist.
- **Fix:** add a plan-card skeleton matching the other tabs' pattern.

### F10 — Android keyboard mode `resize` reflows chat — **P2 ★★☆☆☆**
- `app.config.js:34` `softwareKeyboardLayoutMode: "resize"` triggers full layout reflow on keyboard open. Consider `pan` for chat screens, or adopt `react-native-keyboard-controller` (see F27).

✅ Already good: Hermes + New Arch enabled; `GridSkeleton`/`ListSkeleton`/`RoomListSkeleton`/`ChatSkeleton` exist on all main tabs; status-bar/theme handling correct.

---

## 2. LISTS & REACT RENDERING

### F11 — Browse subscribes to the ENTIRE grid store — **P1 ★★★★☆**
- **Problem:** `app/(tabs)/index.tsx:56` — whole-store destructure `useGridStore()`. Any `set()` (e.g. `loadingMore` flipping twice per pagination) re-renders the whole home screen + FlatList tree.
- **Fix:** per-field selectors (`useGridStore(s => s.cards)`) or `useShallow`.

### F12 — Grid renderItem inline; `UserCardTile` memo defeated — **P1 ★★★★☆**
- **Problem:** `app/(tabs)/index.tsx:422-433` — fresh `onPress={() => openProfile(card)}` arrow + inline row style object every render defeat `React.memo` on `UserCardTile` (`src/components/UserCardTile.tsx:115`). All visible tiles re-render on any Browse state change.
- **Fix:** hoist row style to `StyleSheet`, `useCallback` the renderItem, pass a stable `onPressCard(id)`.

### F13 — 1:1 Chat: message rows NOT memoized — the app's biggest render hotspot — **P0 ★★★★★**
- **Problem:** `app/chat/[id].tsx:1229` (`renderRow`) and `:1094` (`renderMessageBody`) are plain inline functions; no memoized bubble component; `renderItem` not `useCallback`. The screen holds ~30 `useState`s and gets high-frequency socket events (typing, delivery ticks, reactions) — every one re-renders **every mounted row**, rebuilding `LinearGradient`, `MessageTick`, and a **new `Gesture.Pan()` per row per render** (`SwipeToReply`, `:121-150`).
- **Fix:** extract a `memo`'d `ChatMessageRow` mirroring the already-correct rooms pattern (`src/components/rooms/MessageBubble.tsx:330` + `app/rooms/[id].tsx:622`). Wrap `renderItem` in `useCallback`, pass `extraData`.

### F14 — Every socket event rebuilds the whole `messages` array — **P1 ★★★★☆**
- **Problem:** `app/chat/[id].tsx:437,449,485` — read/status/reaction handlers do `setMessages(prev => prev.map(...))`, invalidating `rows`/`pinnedMessage`/`searchItems`/`viewerImages` memos (several do O(n) `[...messages].reverse()`), forcing full list churn per WhatsApp-style tick.
- **Fix:** F13 absorbs most of it; also short-circuit `.map` to return the same array when unchanged; consider a normalized message map keyed by id.

### F15 — Chat list not inverted; triple `scrollToEnd` timing hack — **P1 ★★★★☆**
- **Problem:** `app/chat/[id].tsx:247-254` anchors bottom via RAF + 80ms + 220ms timeouts (`:1516` non-inverted FlatList) → visible jump/settle on open, racy with slow images.
- **Fix:** invert the FlatList with reversed data (standard chat pattern); scroll-to-bottom becomes `scrollToOffset(0)`, no hacks.

### F16 — Chat FlatList has no virtualization tuning — **P2 ★★★☆☆**
- **Problem:** `app/chat/[id].tsx:1516-1564` — no `windowSize`/`initialNumToRender`/`maxToRenderPerBatch`/`removeClippedSubviews`.
- **Fix:** `initialNumToRender={15}`, `windowSize={11}`, `removeClippedSubviews` (Android). Longer term: FlashList.

### F17 — FlashList installed but used in only ONE place — **P1 ★★★★☆**
- **Problem:** FlashList 2.0.2 used only in `app/rooms/[id].tsx:729`. Grid, inbox, right-now, interest, 1:1 chat are all plain FlatList.
- **Fix:** migrate highest-value lists first: Browse grid → Inbox → 1:1 chat. FlashList 2 needs no `estimatedItemSize`.

### F18 — RightNow rebuilds its entire StyleSheet every render — **P1 ★★★☆☆**
- **Problem:** `app/(tabs)/right-now.tsx:225` and `:467` — `makeStyles(theme)` calls `StyleSheet.create` (~40 rules) on every render, including per-keystroke in `CreateSheet`.
- **Fix:** `useMemo(() => makeStyles(theme), [theme])` or module-level static sheet.

### F19 — Inbox: whole-store subscribe + non-memoized rows + no getItemLayout — **P2 ★★★☆☆**
- **Problem:** `app/(tabs)/inbox.tsx:68` whole-store destructure; `:190` inline `renderRow` with inline style arrays; rows are fixed 72px but no `getItemLayout`. `chatStore.applyIncomingMessage` (`src/store/chatStore.ts:54`) rebuilds `conversations` per socket message → all rows re-render.
- **Fix:** selectors + memoized row + `getItemLayout`.

### F20 — Interest lists rebuild pair arrays + unstable rows — **P2 ★★☆☆☆**
- **Problem:** `src/components/interest/ViewsList.tsx:97-114`, `TapsList.tsx:68-102` — `pairs()` builds nested arrays every render; inline renderItem, per-row arrows, unmemoized `PersonCard`/`LockedTile`.
- **Fix:** `useMemo` on pairs, memoized card components, hoisted styles.

### F21 — ThemeContext value + callbacks recreated each render — **P2 ★★☆☆☆**
- **Problem:** `src/theme/ThemeContext.tsx:32-38` — fresh `value={{...}}` object and `toggleTheme` per render; every `useTheme()` consumer re-renders when provider does.
- **Fix:** `useMemo` the value, `useCallback` `toggleTheme`.

### F22 — Groups: components defined inside render body — **P2 ★★☆☆☆**
- **Problem:** `app/(tabs)/groups.tsx:308` `TabButton` declared inside render (new type identity → remount risk); `:463` inline renderItem. Mitigated by memoized `GroupCard` + proper selectors.
- **Fix:** hoist `TabButton`; `useCallback` renderItem.

### F23 — `UserCardTile` recomputes `chips` array every render — **P2 ★★☆☆☆**
- `src/components/UserCardTile.tsx:30-32` — `useMemo` on `[card.bodyType, card.tribes]`.

### F24 — Rooms chat renderItem depends on whole `messages` array — **P2 ★☆☆☆☆**
- `app/rooms/[id].tsx:622-658` — deps include `messages` (date-separator lookup) → recreated per message. Precompute `showDateSep`/`showUnread` into the data items.

✅ Already good: grid `getItemLayout` + keyExtractor; `GroupCard`/rooms `MessageBubble` memoized with comparators; rooms chat (FlashList + memo bubble) is the reference pattern; stores use correct immutable updates; composer owns draft state so typing does NOT re-render the message list.

---

## 3. CHAT & KEYBOARD

### F25 — Text message send is NOT optimistic — **P1 ★★★★★ (biggest single "feels slow" fix)**
- **Problem:** `app/chat/[id].tsx:565-590` — `postMessage` awaits the API before the bubble appears; composer shows spinner meanwhile. On a Render cold start the typed text vanishes for seconds. Photos ARE optimistic (`:839`, `tmp-` bubbles) and `MessageTick` even has a `'sending'` state (`src/components/MessageTick.tsx:18`) that text never uses.
- **Fix:** insert an optimistic `tmp-` text bubble immediately with tick `sending`; replace on success, mark failed + retry affordance on error.

### F26 — No scroll-to-bottom pill / unread divider — **P1 ★★★☆☆**
- **Problem:** `app/chat/[id].tsx:258,1534` — when scrolled up, new messages correctly don't yank the list, but there's no "↓ N new messages" pill and no unread separator on open.
- **Fix:** track `unseenCount` while `!nearBottom`; floating fade-in jump pill; "Unread messages" divider row.

### F27 — KeyboardAvoidingView: Android `height` + `automaticallyAdjustKeyboardInsets` + magic offset 90 — **P1 ★★★★☆**
- **Problem:** `app/chat/[id].tsx:1501-1504,1523` — `behavior='height'` on Android (jank-prone), stacked with the FlatList's `automaticallyAdjustKeyboardInsets` (double adjustment), and `keyboardVerticalOffset={90}` hardcoded.
- **Fix:** adopt `react-native-keyboard-controller` (interactive keyboard dismiss like iMessage as a bonus), or `behavior='padding'` both platforms + measured header height + safe-area insets.

### F28 — Emoji panel swap: keyboard-dismiss gap + wrong height on first open — **P2 ★★★☆☆**
- **Problem:** `src/components/chat/ChatComposer.tsx:225-233` — `Keyboard.dismiss()` then `setTimeout(50-100ms)` → visible blank gap; `keyboardHeight` starts 0 so first open falls back to 280px, mismatching the real keyboard.
- **Fix:** persist last keyboard height; render the panel at known height immediately with a synchronized transition.

### F29 — Typing event emitted on every keystroke — **P2 ★★☆☆☆**
- `src/components/chat/ChatComposer.tsx:261-271` — `onTypingStart()` per character (only stop is debounced). Emit `typing:true` on leading edge only.

### F30 — Reactions / reply / edit bars appear with zero animation — **P2 ★★★☆☆**
- **Problem:** `app/chat/[id].tsx:1334` (reactions row), `ChatComposer.tsx:591-594` (Edit/ReplyBar) — pop in/out instantly, bubble resizes with a hard cut. Zero `LayoutAnimation`/Reanimated `Layout` usage anywhere in chat (grep-verified).
- **Fix:** Reanimated `entering/exiting` (FadeIn/SlideInDown) + `Layout` spring on the bubble; new-message rows get `entering={FadeInDown}` (F31).

### F31 — No entrance animation on new bubbles — **P2 ★★☆☆☆**
- Add `entering={FadeInDown.springify()}` on the memoized row from F13.

### F32 — Upload progress bar exists but is never fed — **P2 ★★★☆☆**
- **Problem:** `ChatComposer.tsx:590` renders only if `uploadProgress != null`; `app/chat/[id].tsx:1568` never passes it; uploads have no progress callback. Docs/video/audio sends show nothing.
- **Fix:** thread `onProgress` from the upload helpers; or indeterminate overlay on the optimistic bubble.

### F33 — Messages live in per-screen `useState`; re-opening a thread is always a cold load — **P2 ★★★☆☆**
- **Problem:** `src/store/chatStore.ts` holds only conversations; `app/chat/[id].tsx:183,346,386` clears and refetches messages every open → `ChatSkeleton` every time.
- **Fix:** cache last-N messages per conversation (store or query cache); render instantly, revalidate.

### F34 — Every send triggers a full inbox refetch — **P2 ★★☆☆☆**
- `app/chat/[id].tsx:575,599,913` — `fetchConversations('inbox', true)` per send instead of the existing local `applyIncomingMessage` (`chatStore.ts:46`). Use the cheap local bump.

✅ Already good: `maintainVisibleContentPosition` + `suppressAutoScroll` (no jump-on-prepend); arrival-driven auto-scroll with pure logic in `src/lib/chatScroll.ts`; reactions/pin/star/unsend optimistic with rollback; pagination dedupes and preserves anchor.

---

## 4. IMAGES

### F35 — Signed-URL cache busting: every refresh re-downloads every image — **P0 ★★★★★ (single biggest bandwidth/perceived-speed win)**
- **Problem:** expo-image's default cache key is the full URI *including query string*. GCS/R2 signed URLs rotate signature params on every backend response, so the same photo re-downloads on every grid refetch (auto every 3 min + every tab focus, `app/(tabs)/index.tsx:169-175`), profile open, inbox refresh. Affects `UserCardTile.tsx:41-47`, `Avatar.tsx:37-43`, `profile/[id].tsx:317,530,565`, `inbox.tsx:209,256`, `right-now.tsx:247,539`, `chat/[id].tsx:1106,1128`, interest lists.
- **Root cause:** no `cacheKey` derived from the stable object path (which the backend already exposes in some types, e.g. `AlbumPhoto.path`).
- **Fix:** create one shared `<RemoteImage>` wrapper that sets `cacheKey` = URL minus query string (or the object path), and use it everywhere.

### F36 — No blurhash/placeholder anywhere — **P1 ★★★☆☆**
- Flat `backgroundTertiary` boxes until network paint; profile hero is a huge empty block. Add blurhash/thumbhash to `UserCard`/`Photo` (or a neutral constant) and pass `placeholder=`.

### F37 — No `recyclingKey` on any list image — **P1 ★★★☆☆**
- Grid/inbox/right-now recycled cells can flash the previous row's photo. Pass `recyclingKey={id}` (grep: 0 current usages).

### F38 — Zero image prefetch — **P1 ★★★☆☆**
- `openProfile` (`index.tsx:214-219`) just navigates; hero loads after profile fetch. `fetchMore` (`gridStore.ts:80`) doesn't warm next-page images. Add `Image.prefetch` on tile press + next-page append.

### F39 — Rooms chat images lack `cachePolicy` — **P2 ★★☆☆☆**
- `src/components/rooms/MessageBubble.tsx:184,195` — add `cachePolicy="memory-disk"` to match 1:1 chat.

---

## 5. NETWORK FEEL & OPTIMISTIC UPDATES

### F40 — `api.ts` has no request timeout — **P1 ★★★★☆**
- **Problem:** `src/services/api.ts:51-103` — bare `fetch`, no `AbortController`. Render cold starts leave screens on skeletons indefinitely; cache-fallback paths never fire.
- **Fix:** ~15s AbortController timeout (longer for uploads) surfacing a timeout `ApiError`.

### F41 — No retry/backoff for idempotent GETs; no in-flight dedupe — **P2 ★★★☆☆**
- Only a one-shot 401 refresh exists (`api.ts:84-89`). Add small retry-with-backoff on 502/503/timeout (exactly what Render cold starts return) + in-flight promise map keyed method+url.

### F42 — Right Now: no cache + GPS fix blocks feed load — **P1 ★★★☆☆**
- `app/(tabs)/right-now.tsx:98-133` — every focus awaits `refreshLocation()` before fetching; no AsyncStorage cache → cold skeleton every visit. Cache last feed (mirror gridStore) + fire load in parallel with GPS.

### F43 — Right Now post/turn-off block on server round-trip — **P1 ★★★☆☆**
- `right-now.tsx:212-223,481-501` — sheet stays open with spinner until PATCH resolves. Apply optimistically via `setUser`, close immediately, rollback on failure.

### F44 — Profile screen: full-screen spinner instead of seeded content — **P2 ★★★☆☆**
- `app/profile/[id].tsx:263-269` — centered `ActivityIndicator` although the grid card (photo/name/age/distance) is already known. Seed initial state from `gridStore.cards` / route params; hydrate with `getPublicProfile`.

### F45 — Inline message from profile: serial awaits + full inbox refetch — **P1 ★★★☆☆**
- `profile/[id].tsx:198-214` — `startConversation` → `sendMessage` → `await fetchConversations` in series with a button spinner. Optimistic send + local inbox bump.

### F46 — Socket reconnect state invisible — **P2 ★★☆☆☆**
- `OfflineBanner` is NetInfo-only; Socket.IO reconnecting (server cold start) silently stalls typing/presence/messages. Expose socket connect state to a store; subtle "reconnecting…" pill.

✅ Already good: taps/shortlist optimistic with rollback; grid + inbox stale-while-revalidate caches; pull-to-refresh never blanks lists; chat photo sends optimistic.

---

## 6. ANIMATIONS, GESTURES, SHEETS

### F47 — All bottom sheets are plain RN `Modal` — no pan-to-dismiss, no animated backdrop — **P1 ★★★★☆**
- **Problem:** 11 sheets use `<Modal animationType="slide">`: `chat/AttachmentSheet.tsx:76`, `rooms/AttachmentSheet.tsx:55`, `ReportSheet.tsx:52`, `ShareAlbumSheet.tsx:68`, `MiniProfile.tsx:115`, `rooms/RoomFilterSheet.tsx:34`, `chat/ReactionDetails.tsx:63`, `ChatLock.tsx:177`, `LocationPicker.tsx:155`, `rooms/GifPicker.tsx:186`, `chat/[id].tsx:1603`. Grabber handles are decorative — no gesture wired. Backdrop hard-cuts because it slides with the modal.
- **Fix:** adopt `@gorhom/bottom-sheet` (`BottomSheetModal`) OR build one shared `Sheet` wrapper: reanimated `Gesture.Pan()` on translateY spring + independently interpolated backdrop opacity. This is the highest-leverage "native feel" refactor — one component fixes 11 surfaces.

### F48 — MediaViewer: no swipe-down-to-dismiss — **P0 ★★★☆☆**
- `src/components/MediaViewer.tsx` — pinch/double-tap/pan zoom are excellent and UI-thread (`:95-141`), but dismissal is back-button only (`:244`). Add vertical `Gesture.Pan()` (when not zoomed) translating the image + fading the backdrop, dismiss past threshold. This is the standard Instagram/WhatsApp gallery gesture.

### F49 — Grid tiles have zero press feedback — **P1 ★★★★☆**
- `src/components/UserCardTile.tsx:35` — the app's primary surface is a bare `Pressable`: no scale, no opacity, no ripple, no haptic. Tapping a profile feels dead. Build a shared `PressableScale` primitive (reanimated scale ~0.96 + opacity) and use it here first.

### F50 — `android_ripple` used NOWHERE — **P1 ★★★★☆**
- Grep: 0 occurrences. No material ripple on any Android touch target — the single biggest "cross-platform RN app" tell on Android. Fold into the `PressableScale` primitive (branch on `Platform.OS`).

### F51 — Like/Tap & Shortlist have no haptic and no animation — **P1 ★★★★☆**
- `app/profile/[id].tsx:216,231` — the signature interaction of a proximity dating app is silent and motionless. Add `Haptics.impactAsync(Medium)` + a heart/flame pop (scale spring) on toggle.

### F52 — Tab switches: no haptic, no icon feedback — **P1 ★★★☆☆**
- `app/(tabs)/_layout.tsx:76` — add `Haptics.selectionAsync()` + a small icon scale/bounce on press.

### F53 — Swipe-to-reply crosses threshold silently — **P1 ★★★☆☆**
- `src/components/rooms/MessageBubble.tsx:139` and `app/chat/[id].tsx:142` — fire a light haptic exactly when `SWIPE_TRIGGER` is crossed (WhatsApp does this; it's what makes the gesture feel "engaged").

### F54 — Skeleton "shimmer" is an opacity pulse, not a shimmer — **P2 ★★☆☆☆**
- `src/components/Skeleton.tsx:10-18` — whole-block opacity 0.4↔1 loop; each Skeleton mounts its own unsynchronized `Animated.loop`. Add a translating `LinearGradient` highlight driven by one shared value.

### F55 — CustomAlert has no exit animation — **P2 ★★☆☆☆**
- `src/components/CustomAlert.tsx:45` — spring entrance, hard-cut unmount on dismiss.

### F56 — ProfileSidebar / ProfilePreviewCard: no pan-dismiss, scrim doesn't fade — **P2 ★★☆☆☆**
- `src/components/ProfileSidebar.tsx:54-61` (tap-only drawer), `src/components/map/ProfilePreviewCard.tsx:33,58`.

### F57 — Missing haptics (secondary): pull-to-refresh, reaction add, group join, attachment pick, OTP success, purchase success — **P2 ★★☆☆☆**
- Present at only 13 call sites; add `selectionAsync` on selection-type actions, `impactAsync`/`notificationAsync(Success)` on completions.

✅ Already good: 0 `TouchableOpacity`, 0 `useNativeDriver:false`; mic↔send morph in `ChatComposer.tsx:555-561` is excellent; hold-to-record with slide-to-cancel + slide-up-lock + 3 haptic points (`ChatComposer.tsx:522-549,433,450,507`) is solid; error-shake in `create-group/details.tsx:82` is a great micro-interaction; map `tracksViewChanges` settling logic is correct.

---

## 7. AUDIO & VOICE

### F58 — AudioPlayer scrubbing maps taps against a hardcoded 150px width — **P1 ★★★☆☆**
- `src/components/chat/AudioPlayer.tsx:115-118,142` — seek = `locationX / 150` while the wave is `flex:1` → wrong position on any real bubble width; no drag scrub at all. Measure with `onLayout` + `Gesture.Pan()`.

### F59 — Multiple voice notes can play simultaneously; no audio session config — **P1 ★★★☆☆**
- `AudioPlayer.tsx:57-70` — each bubble owns its own `createAudioPlayer`; playing a second doesn't pause the first; no `setAudioModeAsync`. Centralize an active-player ref in a store/context.

### F60 — Waveforms are fake (both record and playback) — **P2 ★★☆☆☆**
- `AudioPlayer.tsx:10-19` (bars hashed from URL), `rooms/VoiceRecorder.tsx:15-28` (bars = `Math.random()` on a 400ms loop, never mic amplitude). Feed `expo-audio` metering into shared values at record time; persist peaks with the message so playback bars match.

### F61 — Playback progress quantized to per-bar booleans on coarse status events — **P2 ★★☆☆☆**
- `AudioPlayer.tsx:46-55,119-127` — progress jumps in 1/30 steps. Drive a Reanimated shared value with `withTiming` between status updates.

### F62 — VoiceRecorder timer: JS setInterval + setState per second; can disagree with actual clip duration — **P2 ★★☆☆☆**
- `VoiceRecorder.tsx:40-43` — derive elapsed from `recordStartRef` wall clock instead.

### F63 — `vlog` debug tracer left in ChatComposer (uncommitted) — **P2 ★★☆☆☆**
- `ChatComposer.tsx:~39-45` + ~15 call sites, `__DEV__`-gated. Strip before merge; verify the "recording starts late" bug is actually fixed on a physical device.

### F64 — Lock affordance is static — **P2 ★★☆☆☆**
- `ChatComposer.tsx:636` — animate the lock icon's travel as the finger rises + a haptic "tick" just before the lock threshold.

---

## 8. CALLS

### F65 — Incoming call does not ring or vibrate — **P0 ★★★★☆**
- `src/components/IncomingCallSheet.tsx` — completely silent: no `Vibration`, no ringtone, no haptics, no auto-timeout (the CallToast has one at `ToastConfig.tsx:209`; the Modal sheet doesn't). A silent call UI feels broken. Loop `Vibration.vibrate([...], true)` + optional expo-audio ringtone; stop on accept/decline/timeout (~35s).

### F66 — Two competing incoming-call UIs — **P1 ★★★☆☆**
- `IncomingCallSheet.tsx` (Modal) AND `ToastConfig.tsx:204` (`call_incoming` toast) both wired to call events → possible double surface / double accept. Pick one; delete or gate the other.

### F67 — Call screen ignores safe-area insets — **P1 ★★★☆☆**
- `app/call/[id].tsx:294-299` — `top: 80`, `bottom: 50`, `top: 60` hardcoded; collides with the Dynamic Island. Use `useSafeAreaInsets()`.

### F68 — Accept/decline/controls: zero press feedback or haptics; "Ringing…" is static text — **P1 ★★★☆☆**
- `IncomingCallSheet.tsx:118-132`, `app/call/[id].tsx:263-287,210-212` — pressed scale + haptics on all call buttons; pulse ring on avatar/accept; animated dots during the up-to-15s connect window.

---

## 9. ONBOARDING & MISC NATIVE FEEL

### F69 — Inbox uses native `Alert.alert` while the whole app uses themed `CustomAlert` — **P1 ★★★☆☆**
- `app/(tabs)/inbox.tsx:13,134` — the most destructive action (delete chats) looks different from every other confirm. Swap to `useAlert()`.

### F70 — OTP error: no red cells, no shake — **P2 ★★☆☆☆**
- `src/components/OtpCodeInput.tsx` + `phone-code.tsx:45-48` — add `error` prop (border → `theme.error`) + horizontal shake on failed verify. (Autofill `oneTimeCode` is correctly set ✅.)

### F71 — Onboarding steps hard-swap with no transition — **P2 ★★☆☆☆**
- `app/onboarding/setup.tsx:280-368` — conditional renders keyed on `step`; add fade/slide between steps or a pager.

### F72 — Setup form: no `keyboardShouldPersistTaps` / KAV — **P2 ★★☆☆☆**
- `setup.tsx:279` — chips need two taps while the keyboard is up. Add `keyboardShouldPersistTaps="handled"` + `keyboardDismissMode="on-drag"` + KAV.

### F73 — Map: 200 custom-view markers can jank low-end Android — **P2 ★★☆☆☆**
- `app/map-explore.tsx:98-111,258-340` — clustering + `tracksViewChanges` settling are done right ✅; confirm `ProfileMarker` memoization, consider lower `MAX_MARKERS` on Android.

✅ Already good: onboarding double-submit protection + spinner-in-button everywhere; store purchase busy-state handling; font/splash/status-bar pattern; themed toast system.

---

# FINAL DELIVERABLES

## 1. Top improvements ranked by impact

The full finding list above is the top-73; here are the **top 20 by (impact × breadth)**:

| # | Finding | Priority | Impact |
|---|---------|----------|--------|
| 1 | F35 — `cacheKey` on all signed-URL images (kills constant re-downloads) | P0 | ★★★★★ |
| 2 | F13 — Memoize 1:1 chat message rows (rooms pattern) | P0 | ★★★★★ |
| 3 | F25 — Optimistic text message send | P1 | ★★★★★ |
| 4 | F65 — Incoming call ring/vibrate/timeout | P0 | ★★★★☆ |
| 5 | F1+F2+F3 — Kill splash delay; persist user; single splash | P1 | ★★★★☆ |
| 6 | F47 — Shared pan-dismissable bottom sheet (fixes 11 surfaces) | P1 | ★★★★☆ |
| 7 | F49+F50 — `PressableScale` primitive w/ android_ripple, start with grid tiles | P1 | ★★★★☆ |
| 8 | F11+F12 — Browse: store selectors + stable renderItem (restore tile memo) | P1 | ★★★★☆ |
| 9 | F40 — API request timeout (unsticks every skeleton on cold start) | P1 | ★★★★☆ |
| 10 | F27 — Chat keyboard: keyboard-controller / fix KAV stacking | P1 | ★★★★☆ |
| 11 | F4 — Tabs `freezeOnBlur` + `lazy`; focus-gate GPS interval | P1 | ★★★★☆ |
| 12 | F14 — Stop whole-array message churn per socket tick | P1 | ★★★★☆ |
| 13 | F51 — Tap/shortlist haptic + pop animation | P1 | ★★★★☆ |
| 14 | F17 — FlashList migration (grid → inbox → chat) | P1 | ★★★★☆ |
| 15 | F15 — Inverted chat list (remove triple-scroll hack) | P1 | ★★★★☆ |
| 16 | F48 — MediaViewer swipe-down-to-dismiss | P0 | ★★★☆☆ |
| 17 | F36+F37+F38 — blurhash + recyclingKey + prefetch | P1 | ★★★☆☆ |
| 18 | F42+F43 — Right Now: cache + parallel GPS + optimistic post | P1 | ★★★☆☆ |
| 19 | F26 — Scroll-to-bottom pill + unread divider | P1 | ★★★☆☆ |
| 20 | F52+F53+F57 — Haptics pass (tabs, swipe-reply, refresh, reactions) | P1 | ★★★☆☆ |

Then: F18, F44, F45, F58, F59, F66–F69, F5, F19, F28, F30–F34, F41, F46, and the P2 tail (F6–F10, F20–F24, F29, F39, F54–F57, F60–F64, F70–F73).

## 2. Performance roadmap (render/CPU/network)

1. **Week 1 — hotspots:** F13 (chat rows), F11/F12 (Browse), F14 (message array churn), F18 (RightNow styles), F4 (tab freeze), F35 (image cacheKey), F40 (timeout).
2. **Week 2 — lists:** F17 FlashList migration, F16 virtualization props (interim), F19/F20 inbox+interest memoization, F5 double-fetch, F21 theme context memo.
3. **Week 3 — network feel:** F2 persist user, F33 message cache, F41 retry/dedupe, F42 RightNow cache, F38 prefetch, F34/F45 drop redundant refetches.

## 3. UX polish roadmap

1. F25 optimistic text send → F26 scroll pill → F32 upload progress → F44 profile seeding → F43 optimistic Right Now.
2. F65–F68 call surfaces (ring, single UI, safe areas, feedback).
3. F69 alert consistency, F70–F72 onboarding polish, F9 store skeleton, F46 reconnect pill.

## 4. Animation roadmap

1. `PressableScale` primitive (F49/F50) → roll out grid → buttons → list rows.
2. Shared `Sheet` component or @gorhom/bottom-sheet (F47) → migrate all 11 sheets.
3. Chat motion: F30 reactions/bars entering/exiting, F31 bubble entrance, F53 swipe haptic, F28 emoji swap.
4. F48 MediaViewer dismiss gesture; F54 real shimmer; F55/F56 exits & scrims; F71 onboarding transitions.
5. Audio: F58 scrub gesture, F61 smooth progress, F60 real waveform, F64 lock travel.

## 5. Components needing refactoring

| Component | Why |
|---|---|
| `app/chat/[id].tsx` (~1600 lines, ~30 useStates) | Extract memoized `ChatMessageRow`, invert list, split state; mirror rooms architecture |
| All 11 `Modal`-based sheets | Migrate onto one shared Sheet component |
| `src/components/UserCardTile.tsx` + Browse renderItem | Stable props, PressableScale, cacheKey/recyclingKey |
| `src/components/chat/AudioPlayer.tsx` | Real measurement, pan scrub, single-player coordination |
| `IncomingCallSheet` vs `CallToast` | Merge into one incoming-call surface |
| `app/(tabs)/right-now.tsx` | makeStyles memo, feed cache, optimistic post |
| `Skeleton.tsx` | Shared-driver shimmer |
| `src/services/api.ts` | Timeout, retry, dedupe |
| All remote images | New shared `<RemoteImage>` (cacheKey, placeholder, recyclingKey, transition) |

## 6. Libraries worth adding

- **@gorhom/bottom-sheet** — 11 sheets fixed with one dependency (biggest polish-per-effort).
- **react-native-keyboard-controller** — fixes F27 properly + interactive keyboard dismiss in chat.
- *(optional)* **react-native-mmkv** — synchronous storage kills the theme flash (F7) and speeds all hand-rolled AsyncStorage caches.
- *(optional)* blurhash generation server-side (no client lib needed — expo-image renders blurhash natively).

## 7. Libraries worth removing / consolidating

- **react-native-draggable-flatlist** — verify it's still used; if only one screen uses it, consider replacing with a Reanimated-based reorder to drop a dependency pinned to older list internals.
- Nothing else — the stack is lean and modern. The problem is under-use (FlashList, Reanimated, haptics all installed but barely applied), not bloat.

## 8. Estimated smoothness score

**Today: 58/100.**
Foundation is genuinely good (New Arch, Hermes, expo-image everywhere, FlashList+memo pattern already proven in rooms chat, optimistic reactions, skeletons on main tabs, excellent voice-record gesture). It loses points on: chat render storms, dead touch feedback, Modal sheets, silent calls, image cache busting, and blocking sends.
**After P0+P1 list: ~85/100. After full list: ~92/100.**

## 9. Estimated store UX-quality score

**Today: ~3.6/5 equivalent.** The app works, but Android users will feel the missing ripple/haptics and keyboard jank; everyone will feel slow sends and silent calls. **After the roadmap: ~4.6/5** — competitive with second-tier dating apps; the remaining gap to Tinder/WhatsApp is custom shared-element transitions and years of micro-tuning.

## 10. If I had one week to make this app feel world-class

Ordered exactly as I would implement it:

**Day 1 — Perceived latency killers**
- `<RemoteImage>` wrapper with `cacheKey` (F35) — global find/replace.
- API timeout via AbortController (F40).
- Optimistic text send reusing the photo `tmp-` pattern (F25).

**Day 2 — Startup + home screen**
- Persist user, parallel auth check, single splash, fade transition (F1/F2/F3/F6).
- Browse: selectors + stable renderItem + PressableScale on tiles + tap haptic (F11/F12/F49/F51).
- Tabs `freezeOnBlur`/`lazy` (F4).

**Day 3 — Chat rendering**
- Extract memoized `ChatMessageRow` from `app/chat/[id].tsx` copying `rooms/MessageBubble` (F13/F14).
- Invert the list, delete the triple-scrollToEnd hack (F15).
- Scroll-to-bottom pill + unread divider (F26).

**Day 4 — Keyboard + sheets**
- Install `react-native-keyboard-controller`; fix composer KAV stacking (F27); emoji panel height persistence (F28).
- Install `@gorhom/bottom-sheet`; build shared themed Sheet; migrate AttachmentSheet, ReportSheet, MiniProfile first (F47).

**Day 5 — Motion + haptics pass**
- Roll `PressableScale` (+`android_ripple`) across buttons, rows, call controls (F50).
- Reanimated entering/exiting on reactions, reply/edit bars, new bubbles (F30/F31).
- Haptics: tabs, swipe-reply trigger, pull-to-refresh, reactions, OTP success (F52/F53/F57).
- MediaViewer swipe-down-dismiss (F48).

**Day 6 — Calls + audio**
- Incoming call: vibrate loop + timeout, merge dual UIs, safe-area fix, button feedback, connect pulse (F65–F68).
- AudioPlayer: measured scrub with pan, single active player, smooth progress (F58/F59/F61).

**Day 7 — Sweep + verify**
- Remaining sheets onto shared Sheet; blurhash/recyclingKey/prefetch (F36–F38); Right Now cache + optimistic post (F42/F43); inbox CustomAlert (F69); strip `vlog` (F63).
- Full pass on low-end Android + notched iPhone; `npx tsc --noEmit`; profile with React DevTools to confirm chat/browse re-render counts dropped.

That week takes the app from "works but feels like React Native" to "feels like a product" — every remaining item in this document is then incremental polish.
