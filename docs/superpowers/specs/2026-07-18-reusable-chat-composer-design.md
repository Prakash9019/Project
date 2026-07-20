# Reusable Chat Composer — Design

**Date:** 2026-07-18
**Status:** Approved for planning
**Scope:** Phase 1 — Group Chat first, then swap Inbox onto the same component.

## Problem

There are two independent chat-composer implementations that have drifted:

- **Inbox** (`app/chat/[id].tsx`, ~1554 lines) — composer inlined in the screen.
  Layout: `+` (orange) → gallery → saved-replies list → rounded input → send.
  No emoji-in-field, no camera, no mic, sends gallery photos immediately.
- **Group** (`app/rooms/[id].tsx`, ~1206 lines) — composer inlined, using
  `src/components/rooms/{AttachmentSheet,EmojiPicker,VoiceRecorder,ReplyPreview,GifPicker}`.
  Layout: emoji (outside, left) → input → `+` (right) → camera/mic → send.

Result: divergent icon placement, keyboard behaviour, attachment behaviour, and
spacing. Every change must be made twice and still drifts.

## Goal

One reusable, WhatsApp-grade `ChatComposer` used by **both** screens. Match
WhatsApp *interaction* (not pixel-cloning) with NearMe branding. Phase 1 finalises
the Group composer, then Inbox is switched to the identical component.

## Backend constraints (source of truth: `backend-spec.json` + Prisma)

Supported message types: `text, photo, video, voice, voice_note, audio,
expiring_photo`. Therefore:

- ✅ End-to-end today: Gallery, Camera, Document, Voice note, View Once, Emoji, GIF.
- ⚠️ Location is faked as a `text` message (`📍 label|lat|lng` in 1:1;
  `📍 Location: lat, lng` in rooms). Only **current** location works.
- ❌ No backend: Poll, Event, Contact, Sticker packs, AI-images, live/pinned/search location.

**Decision:** attachment sheet shows only backend-supported items. Unsupported
WhatsApp items are omitted (not shown as "coming soon").

**Decision:** camera uses native `expo-image-picker` `launchCameraAsync` (its
capture+confirm screen is the preview). Custom in-app camera is deferred.

## Architecture

The composer is a **controlled, presentational** component. It owns layout, IME
behaviour, the attachment sheet, the emoji panel, recording UX, and the gallery
preview. It does **not** own message state, sockets, or uploads — those stay in
each screen and are reached through callbacks. This is what lets Group and Inbox
share it despite different feature sets.

### New files — `src/components/chat/composer/`

| File | Responsibility | Depends on |
|------|----------------|------------|
| `ChatComposer.tsx` | Orchestrator. Renders the input bar, `KeyboardAvoidingView` wrapper contract, emoji panel toggle, recording state, mounts `AttachmentSheet` + `GalleryPreview`. Controlled: takes `value`/`onChangeText` and fires callbacks. | all below |
| `ComposerInput.tsx` | The rounded auto-growing pill. Emoji button INSIDE-left; camera + attach (`+`) INSIDE-right. Fixed horizontal padding; grows to `maxHeight` (~5 lines) then scrolls internally; icons pinned via `alignItems:'flex-end'`. | EmojiPicker toggle callback |
| `SendMicButton.tsx` | Animated mic↔send morph. Empty → mic (hold-to-record). Non-empty → gradient send (`theme.gradientWarm`). Reanimated scale/opacity crossfade. | reanimated |
| `GalleryPreview.tsx` | **NEW.** Full-screen `Modal`. Horizontal thumbnails, remove-per-image, one caption field, view-once toggle (1:1 only), Send. Returns `(assets, { caption, viewOnce })` to parent. | expo-image |
| `types.ts` | `ComposerFeatures`, `ComposerProps`, `AttachmentKind`. | — |

### Reused as-is (no changes unless trivial)

`src/components/rooms/{EmojiPicker,VoiceRecorder,ReplyPreview,GifPicker}`.
`AttachmentSheet` is **moved** into the composer folder and its `OPTIONS` list
trimmed to supported kinds (drop `contact`, `sticker`; `video` folded into
gallery/camera). Both screens import the composer's version.

### Props (controlled contract)

```ts
type ComposerFeatures = {
  attachments: AttachmentKind[]; // subset of 'gallery'|'camera'|'document'|'location'|'album'|'gif'
  viewOnce?: boolean;            // 1:1 only — enables the toggle in GalleryPreview
  templates?: boolean;          // 1:1 only — shows the saved-replies button
};

type ComposerProps = {
  value: string;
  onChangeText: (t: string) => void;
  onSendText: () => void;                                  // trims + sends current value
  onSendMedia: (uris: string[], opts: { caption: string; viewOnce: boolean }) => void;
  onPickCamera: () => void;                                // parent launches native camera
  onSendDocument: () => void;
  onSendLocation: () => void;
  onSendGif: (gif: GifResult) => void;
  onSendVoice: (uri: string, durationMs: number) => void;  // parent uploads + sends
  onOpenTemplates?: () => void;                            // 1:1 only
  onOpenAlbum?: () => void;                                // 1:1 only
  replyTo?: { senderName?: string | null; content: string } | null;
  onCancelReply?: () => void;
  editing?: boolean;
  sending?: boolean;
  placeholder?: string;
  features: ComposerFeatures;
};
```

The composer performs the **gallery pick → GalleryPreview → onSendMedia**
internally (owns `ImagePicker.launchImageLibraryAsync` + preview state), because
that flow is identical for both screens. Camera/document/location/gif/voice are
delegated to the parent because their upload/send pipelines differ.

## Data flow

1. **Text:** `value`/`onChangeText` controlled by parent; `onSendText` fires on send tap.
2. **Gallery:** composer picks multi-select → shows `GalleryPreview` → on Send calls
   `onSendMedia(uris, { caption, viewOnce })`. Parent runs its existing upload pipeline
   (group: `queueImages`/sequential R2; 1:1: `uploadAndSendPhoto` loop). Caption becomes
   a trailing text message or per-image content per parent's choice (Phase 1: caption sent
   as a separate trailing text message if non-empty — keeps backend contract unchanged).
3. **Voice:** composer runs the hold-to-record gesture + `VoiceRecorder` overlay, then
   calls `onSendVoice(uri, durationMs)`; parent uploads to R2 and sends `type:'voice'`.
4. **Camera/document/location/gif/album/templates:** composer invokes the matching callback.

## WhatsApp interaction spec

- Emoji button INSIDE the pill on the left; icon swaps happy↔keyboard when panel open;
  stays inside regardless of keyboard state.
- Attach (`+`) and camera INSIDE the pill on the right.
- Mic/Send button OUTSIDE the pill on the right; morphs mic→send when text present.
- Pill: fixed horizontal padding, rounded (`radius.xl`), multiline autogrow to `maxHeight`
  (~110px), internal scroll past that, no layout jump, icons vertically pinned to bottom.
- Attachment `+` opens the bottom sheet with the existing slide animation.
- Reply preview bar sits directly above the pill (`ReplyPreview`).

## Keyboard behaviour

Keep `KeyboardAvoidingView` (`behavior: padding` iOS / `height` Android,
`keyboardVerticalOffset` 90 iOS as today). The composer exposes no keyboard logic
of its own beyond the input; the screen keeps its list + KAV wrapper. Goal: composer
never overlapped, stays attached above the keyboard, no bottom-spacing jump. If the
current KAV offset proves unstable during verification, standardise the offset via
`useHeaderHeight`/safe-area insets — but do not introduce a new keyboard library in Phase 1.

## Preserve (must not regress)

Socket.IO events, typing indicators, replies, reactions, GIFs, voice, images (multi),
documents, location, view-once (1:1), album share (1:1), templates (1:1), edit (1:1),
delivery/read ticks, pinned banner (group), search-in-chat.

## Rollout

1. Build composer folder + `GalleryPreview` + trimmed `AttachmentSheet`.
2. Wire **Group** (`rooms/[id].tsx`) to `ChatComposer`; delete its inline input bar.
   Finalise WhatsApp look/behaviour here. Verify.
3. Wire **Inbox** (`chat/[id].tsx`) to the same `ChatComposer`; delete its inline bar.
   Map its extra callbacks (view-once, album, templates, edit). Verify.
4. `cd frontend && npx tsc --noEmit` → 0 errors. Visual check both screens.

## Out of scope (documented follow-ups)

Custom in-app camera (flash/switch/video-note/gallery-strip/retake); live/pinned/search
location; polls; events; contact sharing; sticker packs; AI images. Each needs either a
large native build or new backend message types + migrations.
