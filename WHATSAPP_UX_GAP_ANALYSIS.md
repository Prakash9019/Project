# NearMe WhatsApp UX Gap Analysis

> **Methodology note:** this is a deep static code audit (every finding carries file:line evidence),
> produced without a physical device attached to this session. Findings marked **[DEVICE]** are
> checklist items that can only be finally confirmed on hardware (frame rate, haptic feel, timing
> perception). Everything else is verified in code. All paths are relative to `frontend/`.
> WhatsApp is the interaction benchmark only — no WhatsApp business features are proposed.

---

## Priority 0 Verification Results

Verification of the fixes shipped this session, against the actual code.

### Chat header — ✅ implemented as specified
| Check | Status | Evidence |
|---|---|---|
| Avatar 36px | ✅ | `app/chat/[id].tsx` `headAvatar: { width: 36, height: 36, borderRadius: 18 }` |
| Call icons 22px monochrome | ✅ | `call-outline`/`videocam-outline` size 22, `theme.textPrimary` (disabled → `theme.callDisabled`) |
| Header height 56px | ✅ | `header: { height: 56, paddingHorizontal: 4, borderBottomWidth: hairline }` |
| Subtitle Online / last seen | ✅ | `typing…` → `Online` → `last seen {relativeTime}` from the existing `getPublicProfile` call |
| Green online dot on avatar | ✅ | 10px `onlineDot`, `theme.online`, bottom-right |
| Feels as light as WhatsApp | **[DEVICE]** | proportions match; confirm on hardware |

⚠️ Residual gap: `relativeTime` renders `"7m"`, `"3h"` — so the subtitle reads *"last seen 3h"*, not
WhatsApp's *"last seen today at 14:32"*. P2, `src/lib/format.ts:62`.

### Context menu — ✅ implemented, 3 residual gaps
| Check | Status | Evidence |
|---|---|---|
| Appears near tapped message | ✅ | anchored to long-press `pageY`, above/below by screen half, clamped |
| ~220px wide | ✅ | `menuList: { width: 220 }` |
| Rows ~44px | ✅ | `paddingVertical: 10`, 15px text, 20px icons |
| Emoji row compact 36px targets | ✅ | `emojiBtn: 36×36`, 48px pill |
| Spring scale-in | ✅ | `0.85 → withSpring(1, {damping:20, stiffness:320})` (`app/chat/[id].tsx:1356` area) |
| Haptic on long press | ✅ | `Impact.Medium` at `app/chat/[id].tsx:1348` |

⚠️ Residual gaps (new findings, listed in INBOX CHAT below): no bubble "lift" while menu is open;
dismiss is a plain Modal fade with no scale-out; the **rooms** `ContextMenu.tsx` is still
screen-centered (only its sizing was compacted).

### Search — ✅ implemented
| Check | Status | Evidence |
|---|---|---|
| Header transforms in place | ✅ | search branch replaces the header row; old sub-header bar removed |
| Brand-highlighted matches in bubbles | ✅ | `searchTerm` prop segments text, `brand+'30'` bg |
| "3 of 12" counter | ✅ | `{matchIds.length - searchNav} of {matchIds.length}` |
| Up/down arrows | ✅ | chevrons navigate `matchIds`, disabled states at ends |
| Tap result → scroll + highlight | ✅ | `scrollToMatch` waits 350ms for list re-mount (this was silently broken before — the list was unmounted when `scrollToIndex` fired) |
| Exit restores header | ✅ | back arrow resets `searchOpen/searchQuery/searchNav` |

⚠️ Limitation: matches only cover **loaded** messages; a match deep in un-paginated history won't be
found. P2 (WhatsApp searches full history).

### Message density — ✅ implemented
| Check | Status | Evidence |
|---|---|---|
| Compact bubbles | ✅ | `paddingHorizontal: 9, paddingVertical: 6` (was 14/9) |
| Max width 75% | ✅ | `bubbleRow: { maxWidth: '75%' }` |
| 2px same-sender / 8px sender-change | ✅ | per-row `marginTop` from prev-row sender comparison |
| Timestamp inside bubble | ✅ | `metaInBubble`, white@70% on gradient / textTertiary received |
| Compact date pill | ✅ | 12px text, radius-999 pill |

⚠️ New inconsistency created: **group chat still puts the timestamp below the bubble**
(`src/components/rooms/MessageBubble.tsx:338-349`) — the two chat surfaces now have different
silhouettes. Fix listed under GROUP CHAT P1.

---

## Executive Summary

**Overall UX score vs WhatsApp: 58/100.**
Structure and feature coverage are strong (search tabs, reactions, voice notes with real waveforms,
ticks, starring, pinning all exist); what's missing is the *motion and tactility layer* — WhatsApp's
feel comes from hundreds of tiny transitions and haptics that NearMe renders as hard cuts.

### Top 3 things making it feel different
1. **The 1:1 chat list is a non-inverted FlatList anchored by `scrollToEnd` hacks**
   (`app/chat/[id].tsx` initial-anchor effect fires `scrollToEnd` at 0/80/220ms). Chat open visibly
   settles instead of appearing bottom-anchored; image loads can shift content. The rooms screen
   already does it right (inverted FlashList). This is the single biggest "feels different" factor.
2. **No transition layer.** Zero `LayoutAnimation` in the repo; ~30 RN `<Modal>`s with stock
   `slide`/`fade`; the full-screen MediaViewer **pops in with no animation at all** and has no
   swipe-down-to-dismiss; reply bar, mention panel, emoji panel, badges all hard-cut in/out.
3. **Inconsistent tactility.** Send has a rich pop+flash+haptic, but composer icons, reactions,
   inbox rows (`PressableScale` neutered with `scale={1}`), Right Now cards/FAB, and all of Filters
   have no press feedback or haptic. Same gestures use different haptics in 1:1 vs rooms.

### Top 5 quick wins (impact ÷ effort)
1. **Fix light-mode received-bubble contrast** — `#FFF9F3` on `#FFF6EE` background is ~invisible
   (`src/theme/colors.ts:23` vs `:19`). One color token.
2. **Remove `scale={1}` from inbox rows** (`app/(tabs)/inbox.tsx:202`) — instantly restores press
   feedback on the most-touched surface in the app. One line.
3. **Linkify URLs in message text** — URLs in bubbles are not even tappable
   (`app/chat/[id].tsx:396`, rooms equivalent). Small helper reused in both bubbles.
4. **Haptic at the swipe-reply threshold** (both bubbles fire on release, not at 60px crossing) —
   `runOnJS(Haptics…)` inside the existing pan `onUpdate`. A few lines.
5. **Animate reply/edit-bar mount** — one `entering={FadeInDown}/exiting={FadeOutDown}` pair in
   `ChatComposer.tsx:654-657`. Two lines, removes the most-noticed hard cut in the composer.

---

## INBOX CHAT

### P0 — Broken or obviously wrong

**1. Received bubbles are nearly invisible in light mode**
- Interaction: reading any conversation in light theme
- Current: received bubble `surfaceElevated #FFF9F3` on background `#FFF6EE` — ~1.01:1 delta (`src/theme/colors.ts:19,23`)
- WhatsApp: received bubbles clearly separated from wallpaper
- Root cause: wrong color token for bubble surface
- Fix: give received bubbles a dedicated token (e.g. `#FFFFFF` + hairline border, or darken to `#FCEDE0`) in `src/theme/colors.ts`; consume in `app/chat/[id].tsx` + `MessageBubble.tsx`
- Complexity: Simple

**2. Chat list is non-inverted; open anchors via triple `scrollToEnd`**
- Interaction: opening a chat from inbox
- Current: `FlatList` chronological + `scrollToEnd` at rAF/80ms/220ms to "reliably land at the newest message"; image loads reflow content (`app/chat/[id].tsx` initial-anchor effect)
- WhatsApp: opens instantly bottom-anchored, zero settle
- Severity: P0 · Root cause: layout architecture (list direction)
- Fix: invert the list like `app/rooms/[id].tsx` (inverted FlashList, `scaleY: -1` rows) — newest at offset 0, no anchoring hacks, image loads push *up* off-screen instead of shifting the viewport
- Complexity: Complex (touches auto-scroll, pagination, unread divider, search jump)

**3. URLs in messages are dead text**
- Current: `<Text>{item.content}</Text>` — not tappable, not selectable (`app/chat/[id].tsx:396`); ironically the Links tab already extracts URLs (`app/chat/media.tsx:201`)
- WhatsApp: links tappable + preview card
- Fix: linkify pass in the text renderer (regex split → `<Text onPress={Linking.openURL}>` in brand color); preview cards are a follow-up (needs OG fetch — Medium/Complex)
- Complexity: Simple (linkify) / Complex (preview cards)

### P1 — Feels different from WhatsApp

**4. No bubble "lift" during context menu** — WhatsApp scales the pressed bubble ~1.03 and keeps it visible above the blur; NearMe blurs everything uniformly. Fix: render a copy of the pressed bubble (or scale the row via shared value) above the BlurView. `app/chat/[id].tsx` menu IIFE. Medium.

**5. Context menu dismisses with a plain fade** — entry is spring-scale, exit is Modal fade only. Fix: drive dismissal through the same `menuScale` (`withTiming(0.9, 120ms)` + fade, then unmount). Medium.

**6. Reply/edit bar hard-cuts in/out** — `ChatComposer.tsx:654-657`, no animation. WhatsApp slides it up ~150ms. Fix: `Animated.View entering={FadeInDown.duration(150)} exiting={FadeOutDown.duration(120)}`. Simple.

**7. Swipe-reply haptic fires on release, not at threshold** — `app/chat/[id].tsx:1367` (and rooms `:681`). WhatsApp buzzes the instant the arrow "arms" at ~60px. Fix: in the pan `onUpdate` worklet, fire `runOnJS(hapticLight)()` once when crossing `SWIPE_TRIGGER`. Simple.

**8. Voice recording: nothing tracks the finger** — cancel/lock are boolean thresholds (`ChatComposer.tsx:590-594`); the "Slide to cancel" hint, mic, and lock chevron are static. WhatsApp translates the hint with the drag and animates the lock chevron. Also missing: haptic at the cancel threshold (`updateCancelling` :500), "hold to record" toast for <1s clips (silently dropped, :534-536), and the timer lags 1s (`VoiceRecorder.tsx:42-48`). Fix: bind pan `translationX/Y` to hint/lock transforms; add threshold haptic; toast on short clip. Medium.

**9. MediaViewer pops in with no animation and no swipe-down dismiss** — not a Modal; `if (!visible) return null` (`src/components/MediaViewer.tsx:306,419`). WhatsApp zooms from the thumbnail and drag-dismisses with backdrop fade. Fix (staged): (a) fade+scale-in 180ms — Simple; (b) vertical pan-to-dismiss with progress-linked backdrop opacity — Medium; (c) shared-element from bubble — Complex.

**10. Two divergent photo viewers** — `PhotoViewer.tsx` (Modal fade, no zoom/pan/save) is used for own view-once photos while `MediaViewer` serves normal photos. Fix: route everything through MediaViewer. Medium.

**11. Composer icons have zero press feedback** — attach/emoji/camera are bare `Pressable`s (`ChatComposer.tsx:667,685,691`) next to a send button with pop+flash+haptic. Fix: wrap in the existing `PressableScale` (haptic off, scale 0.9). Simple.

**12. Emoji↔keyboard swap uses hardcoded setTimeout** — 100ms iOS / 50ms Android (`ChatComposer.tsx:268-276`); brief dead frame where neither is up. Panel height matching is already correct (`:752`). Fix: drive the swap from `keyboardDidHide` event instead of a timer. Medium.

**13. No played/unplayed voice-note affordances beyond bar fill** — no drag-scrub (tap-only seek, `AudioPlayer.tsx:111`), speed pill has no press feedback, legacy notes render flat 0.4 bars. Fix: add pan gesture for scrub; PressableScale on speed pill. Medium.

**14. Deleted message is plain italic text** — no ban icon (`app/chat/[id].tsx:220`, rooms `:259-262`). WhatsApp: 🚫 icon + italic muted. Fix: prepend `Ionicons name="ban-outline" size={14}`. Simple.

**15. Reaction has no haptic and pulses on removal too** — `ReactionPill.tsx:26-31`, zero haptics. Fix: `selectionAsync()` on react; skip pulse when removing. Simple.

### P2 — Minor polish

- **16. Bubble tail on wrong corner in 1:1** — own bubble flattens **bottom**-right 4px (`app/chat/[id].tsx` bubble JSX) while rooms flatten **top** corners 0 (`MessageBubble.tsx:513-515`) — WhatsApp's convention and internally inconsistent. Align 1:1 to top-corner. Simple.
- **17. WhatsApp only shows a tail on the *first* bubble of a sender group** — both surfaces show it on every bubble. Pair with the grouping logic already computing `sameSenderAsPrev`. Simple.
- **18. Scroll-to-bottom button**: timing fade only, haptic explicitly disabled, badge pops with no animation (`ScrollToBottomButton.tsx:27,42`). Swap to spring + animate badge. Simple.
- **19. ChatSkeleton reads as a grid, not a chat** — uniform 44px bubbles pulsing in unison, 700ms loop (`Skeleton.tsx:8-18,46-65`). Vary widths/heights, stagger. Simple.
- **20. "last seen 3h"** wording (see P0 verification note). Simple.
- **21. Upload progress**: works and is real XHR progress (`uploadToR2.ts:35-37`; both callers correctly ×100) — no action; noted because it was suspected during audit.

---

## GROUP CHAT

### P0
**22. Video messages leave the app** — rendered as a generic "Video · Tap to play" card that `Linking.openURL`s externally (`MessageBubble.tsx:120-122,234`). WhatsApp: inline thumbnail + duration + in-app player. Fix: reuse MediaViewer with `expo-video` for playback; thumbnail via `expo-video-thumbnails`. Complex.

**23. Rooms context menu still screen-centered** — `src/components/rooms/ContextMenu.tsx:100` (`styles.center`). Only sizing was compacted this session. Fix: port the 1:1 anchoring (pass `pageY` from `MessageBubble` long-press through `rooms/[id].tsx`). Medium.

### P1
- **24. Timestamp below bubble** (`MessageBubble.tsx:338-349`) — port the 1:1 `metaInBubble` treatment (incl. `MessageTick mutedColor` on gradient). Medium.
- **25. Bubble padding/width don't match 1:1** — 12/10 padding, 78% width vs 9/6, 75%. Align. Simple.
- **26. No animated typing dots anywhere** — plain `<Text>` in rooms (`app/rooms/[id].tsx:1004`) and 1:1 header (`app/chat/[id].tsx` subtitle). WhatsApp animates three dots. Fix: small `TypingDots` component (3 dots, staggered `withRepeat` opacity/translateY), reuse in both. Simple/Medium.
- **27. GIFs are inert** — no tap, no long-press, no GIF badge (`MessageBubble.tsx:195-203`). Wrap in the same Pressable as images. Simple.
- **28. Mentions are inert and invisible in own messages** — `@name` styled but no `onPress` (`MessageBubble.tsx:26-37`); own-message mentions are `#fff` = indistinguishable. Fix: `onPress` → MiniProfile (member lookup by first name), own-mention style `rgba(255,255,255,0.9)` + underline or bolder. Medium.
- **29. Mention autocomplete pops with no animation, rows have no feedback** (`ChatComposer.tsx:641-651`). `entering={FadeInDown}` + PressableScale rows. Simple.
- **30. Quoted replies show no media thumbnail** (`MessageBubble.tsx:170-192`; 1:1 same). WhatsApp shows a 40px thumb for photo replies. Medium.
- **31. Haptic vocabulary differs from 1:1** — long-press Light (rooms `:825`) vs Medium (1:1 `:1348`); swipe-reply `selectionAsync` (rooms `:681`) vs Light (1:1 `:1367`). Standardize (long-press Medium, swipe Light-at-threshold). Simple.

### P2
- **32. No message-entry animation in rooms** — 1:1 has `FadeInDown` for new rows (`app/chat/[id].tsx:556` area); rooms has none. Simple.
- **33. Sender header**: name 13px semibold brand + age ✓, verified 12px ✓, admin chip ✓, avatar 36 ✓, distance not shown ✓ (intentional). Only gap: name row tap target is small. OK overall.
- **34. Dead duplicated styles** `reactionPill/Emoji/Count` (`MessageBubble.tsx:540-542`). Cleanup. Simple.
- **35. Group header** now 56px/36px avatar/15px title ✓ (this session). Group info screen not re-audited here — verify badges on device. **[DEVICE]**

---

## RIGHT NOW

### P0
**36. "Live · 42m left" countdown never ticks** — computed once at render (`app/(tabs)/right-now.tsx:238,271`); only updates on refresh. Fix: 30s `setInterval` re-render (or derive from a ticking `now` state). Simple.

**37. "Learn More" button does nothing** — no `onPress` (`right-now.tsx:363`). Wire or remove. Simple.

### P1
- **38. Cards/FAB have no press animation or haptic** — cards use `opacity: 0.85` (`:242`), FAB is a bare Pressable with no shadow (`:387-394`). Fix: `PressableScale` both; add elevation/shadow to FAB. Simple.
- **39. Sheet toggles teleport** — static `translateX` knobs (`:527,:566`; same pattern in `app/filters.tsx:205`). Fix: shared `AnimatedSwitch` (spring knob, 150ms track color). Simple component, several call sites.
- **40. Skeleton overlays the live list at magic `top:120`** (`:384,:662`) — misaligns if header/chips change height. Render skeleton *instead of* the list. Simple.

### P2
- **41. Post-status sheet is stock `animationType="slide"`** (`:507`) — migrate to the existing `AppBottomSheet` (documented as the migration target, `src/components/ui/AppBottomSheet.tsx:46`) for gesture dismiss. Medium.
- **42. Zero haptics in the entire screen** — add Light on card press (via PressableScale), Success on status post. Simple.

---

## BROWSE

### P0
*(none — the grid is the healthiest surface: memory-disk caching with stable cache keys defeating signed-URL rotation (`RemoteImage.tsx:39,58`), PressableScale tiles with haptic, `getItemLayout` provided)*

### P1
- **43. Skeleton geometry ≠ grid geometry** — skeleton: gap 2, radius 0, no padding (`Skeleton.tsx:27-43`); grid: PAD 12, GAP 6, radius 16 (`index.tsx:36-38`, `UserCardTile.tsx:119`). Visible jump at load. Match the constants. Simple.
- **44. Filter apply wipes the grid** — `apply()` bumps `filterVersion` → full `acquireAndLoad(false)` reload to skeleton (`index.tsx:194-196`). WhatsApp-grade: keep the old grid dimmed under a spinner until new data lands. Medium.
- **45. Filters screen has zero haptics/press states, teleporting switches** (`app/filters.tsx` throughout, knob `:205`). Same `AnimatedSwitch` + PressableScale sweep. Simple.

### P2
- **46. Quick-filter chip active state is a hard component swap** (LinearGradient ↔ View, `index.tsx:308-331`) — no crossfade. Simple.
- **47. FlatList tuning headroom** — no `windowSize`/`removeClippedSubviews`/`maxToRenderPerBatch` on the grid; fine at current sizes, tune if device profiling shows drops. **[DEVICE]**
- **48. Tab switches are instant** with no cross-fade (`app/(tabs)/_layout.tsx:155-171`) — matches WhatsApp Android, acceptable; leave.

---

## ANIMATION AUDIT

| Component | Current behavior | WhatsApp behavior | Fix |
|---|---|---|---|
| MediaViewer open/close | none — conditional mount (`MediaViewer.tsx:306`) | zoom-from-thumb + drag dismiss | staged: fade/scale → pan-dismiss → shared element |
| Reply/Edit bar | hard cut (`ChatComposer.tsx:654-657`) | slide up ~150ms | `entering/exiting` FadeInDown/OutDown |
| Context menu dismiss | Modal fade only | scale-down + fade | drive `menuScale` on close before unmount |
| Bubble on long-press | no press state | dim + slight scale "lift" | scale row via shared value while menu open |
| Emoji panel mount | pops (`ChatComposer.tsx:752`) | slides with keyboard | animate height from `keyboardHeight` |
| Mention panel | pops (`ChatComposer.tsx:641`) | fade/slide in | `entering={FadeInDown.duration(120)}` |
| Voice cancel/lock hints | static booleans (`ChatComposer.tsx:590-594`) | track finger, chevron animates | bind pan translation to transforms |
| Typing indicator | static text (rooms `:1004`, 1:1 header) | 3 animated dots | `TypingDots` with staggered `withRepeat` |
| ScrollToBottom | 200ms timing fade (`ScrollToBottomButton.tsx:27`) | springy pop | `withSpring`, animate badge mount |
| Unread badge (btn+inbox) | conditional mount | scale-in pop | `entering={ZoomIn.springify()}` |
| Skeleton shimmer | 700ms unison opacity pulse (`Skeleton.tsx:12`) | subtle fast shimmer | 450ms, stagger rows, vary sizes |
| Toast pulse | 600+600ms (`ToastConfig.tsx:180`) | snappy ≤250ms | shorten |
| Switch knobs (RightNow/Filters) | static translateX (`right-now.tsx:527`, `filters.tsx:205`) | sprung knob | shared AnimatedSwitch |
| RN `<Modal>` sheets (~30) | stock slide/fade, no gesture | gesture-driven sheets | migrate hot paths to `AppBottomSheet` |
| Message entry (rooms) | none | subtle rise-in | copy 1:1's gated `FadeInDown` |
| Reaction pill add/remove | pulse on press only, none on mount | pop-in on add | `entering={ZoomIn}`; skip pulse on removal |

Healthy already: mic↔send morph (150ms + camera collapse — genuinely WhatsApp-grade,
`ChatComposer.tsx:603-609`), send pop+flash (`:618-624`), swipe-reply spring-back (damping 18/220),
new-message FadeInDown gating (only truly-new rows), pinch zoom clamp 1–5 with double-tap 3×.

## HAPTICS AUDIT

| Interaction | Should be | Currently is |
|---|---|---|
| Swipe-reply threshold crossing | Impact.Light at 60px | fires on **release**; rooms uses `selectionAsync`, 1:1 uses Light — inconsistent |
| Long-press message | Impact.Medium (both surfaces) | 1:1 Medium ✓ / rooms **Light** (`rooms/[id].tsx:825`) |
| Add reaction | selectionAsync | **none** (`ReactionPill.tsx`) |
| Voice cancel-threshold crossing | Impact.Light | **none** (`ChatComposer.tsx:500`) |
| Composer attach/emoji/camera | none needed (WhatsApp silent) | none ✓ |
| Scroll-to-bottom tap | Impact.Light | explicitly disabled (`ScrollToBottomButton.tsx:42`) |
| Share / delete in MediaViewer | Light / Notification.Warning + confirm | **none**, delete has no confirm (`MediaViewer.tsx:291-304`) |
| Save image error | Notification.Error | none (success path ✓ `:282`) |
| Right Now: card tap, status posted | Light / Success | **zero haptics in file** |
| Filters: apply | Impact.Light | **zero haptics in file** |
| Inbox row press | Light (via PressableScale) | present but scale disabled (`inbox.tsx:202`) |
| Voice speed toggle | selectionAsync | none (`AudioPlayer.tsx:72-76`) |
| Recording start on touch-down | immediate Light on touch, Medium on start | only Medium after async start (`ChatComposer.tsx:479`) |

Well-calibrated already: send Medium, record start/lock/cancel trio (Medium/Rigid/Warning),
join/purchase/save Success-Error pairs, multi-select entry Medium.

## SIZING AUDIT

| Element | Current | WhatsApp | File:line |
|---|---|---|---|
| 1:1 own-bubble tail corner | bottom-right 4 | top-right flat, first-of-group only | `app/chat/[id].tsx` bubble JSX |
| Rooms bubble padding | 12H/10V | ~9H/6V (match 1:1) | `MessageBubble.tsx:512` |
| Rooms bubble maxWidth | 78% | 75% | `MessageBubble.tsx:286` |
| Rooms timestamp | below bubble | inside bottom-right | `MessageBubble.tsx:338-349` |
| Inbox avatar | 52px | 49–52px ✓ | `inbox.tsx:459` |
| Inbox unread badge | 20px, no 99+ cap | ✓ size; add cap + green-tint time for unread | `inbox.tsx:469`, `:239` |
| Ticks | 13–14px ✓ | ✓ | `MessageTick.tsx` |
| Chat header / avatar / name | 56 / 36 / 15 ✓ | ✓ | fixed this session |
| Context menu | 220w / 44 rows ✓ | ✓ | fixed this session |
| Voice play icon | 36 ✓ | ~34–38 ✓ | `AudioPlayer.tsx:105` |
| ChatSkeleton bubbles | uniform h44 | varied 30–70 | `Skeleton.tsx:60` |
| Browse skeleton | gap 2 / r0 / pad 0 | must match grid: gap 6 / r16 / pad 12 | `Skeleton.tsx:27-43` |

## PERFORMANCE

Device metrics require hardware — measure on the physical Android dev build and fill in:

```
Chat open time (tap → first frame):        ___ ms   (target < 300)
Time to bottom-anchored stable list:       ___ ms   (target: no visible settle — currently 3-stage scrollToEnd, expect visible settle)
Scroll FPS through 50+ messages:           ___ fps  (adb shell dumpsys gfxinfo / Perf monitor)
Image load, cached:                        ___ ms   (expect near-0: memory-disk + stable cacheKey)
Image load, uncached:                      ___ ms
Voice record touch-down → recording:       ___ ms   (expect >200ms: minDuration 200 + async prepare)
```

Static risk analysis:
- **High risk:** 1:1 chat open settle (non-inverted list, issue #2); every image row is fixed
  200–220px so mid-list loads don't reflow row height, but the initial anchor is the problem.
- **Medium:** `renderRow` deps include `rows` + search state — acceptable because `ChatMessageRow`
  is memoized with a field comparator; keep the comparator in sync when adding props.
- **Low:** Browse grid pre-chunked rows + `getItemLayout` + memoized `GridRow` is sound; rooms
  FlashList is sound. `maintainVisibleContentPosition` correctly guards prepends.

## TOP 10 QUICK WINS

1. **Received-bubble contrast (light mode)** — `src/theme/colors.ts:23`: new token for bubble surface. *Every light-mode chat instantly gains WhatsApp's figure-ground clarity.*
2. **Inbox press feedback** — delete `scale={1}` at `app/(tabs)/inbox.tsx:202`. *Most-used rows feel alive again.*
3. **Reply-bar animation** — `ChatComposer.tsx:654-657`: `entering={FadeInDown.duration(150)}` / `exiting={FadeOutDown.duration(120)}`. *Kills the most-seen hard cut.*
4. **Threshold haptic for swipe-reply (both surfaces)** — fire once in pan `onUpdate` at 60px; unify type to Light. *The gesture "clicks" like WhatsApp.*
5. **Linkify URLs in bubbles** — shared helper in both text renderers. *Tappable links are table stakes.*
6. **TypingDots component** — replace static text in `rooms/[id].tsx:1004` + 1:1 header subtitle. *Conversations feel live.*
7. **Right Now countdown tick + Learn More handler** — `right-now.tsx:238,363`. *Removes two "is this broken?" moments.*
8. **Deleted-message ban icon** — both bubbles. *Instant WhatsApp visual parity for a common state.*
9. **Reaction haptic + skip pulse on removal** — `ReactionPill.tsx`. *Reactions feel intentional.*
10. **MediaViewer fade/scale-in (stage 1)** — wrap root in `entering={FadeIn.duration(150)}` + scale 0.96→1. *Biggest bang-per-line on the media path.*

## IMPLEMENTATION ROADMAP

**Day 1 — quick wins (all Simple):** items 1–10 above, plus: composer icons → PressableScale (#11),
scroll-to-bottom spring + badge pop (#18), rooms bubble padding/width parity (#25), GIF tap handler
(#27), haptic vocabulary unification (#31), Browse skeleton geometry (#43), dead styles cleanup (#34).

**Day 2–3 — medium fixes:**
- Rooms context-menu anchoring (port 1:1 pageY flow) + bubble lift + animated dismiss (#4, #5, #23)
- Rooms timestamp inside bubble with `mutedColor` ticks (#24)
- Voice gesture polish: finger-tracking cancel/lock, threshold haptic, short-clip toast (#8)
- MediaViewer stage 2: swipe-down-to-dismiss with backdrop fade; retire `PhotoViewer` (#9, #10)
- Mention tap → MiniProfile + own-message mention styling; panel animation (#28, #29)
- AnimatedSwitch component → Right Now + Filters knobs (#39, #45)
- Emoji/keyboard swap driven by keyboard events (#12); quoted-reply media thumbnails (#30)
- Filter apply without grid wipe (#44)

**Week 2 — complex fixes:**
- **Invert the 1:1 chat list** (FlashList like rooms) — removes the open-settle and image-shift class of issues entirely (#2). Do this before deep animation work on the list.
- Inline video messages: thumbnails + in-app player via MediaViewer (#22)
- Link preview cards (OG fetch + cached preview component) (#3b)
- MediaViewer stage 3: shared-element open from the bubble thumbnail
- `AppBottomSheet` migration for the hottest RN Modals (attachment sheet, forward sheet, Right Now post sheet) (#41)

**After each batch:** `cd frontend && npx tsc --noEmit` must exit 0; re-run the device checklist in
the PERFORMANCE section and the [DEVICE] items in Priority 0.
