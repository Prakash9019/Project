# Grindr Clone — Screen-by-Screen Spec

This is the authoritative per-screen reference for the UI replica. For each
screen: the **route file**, what it shows, key components, exact styling notes,
and the matching **reference image** in `docs/reference/`. Open the reference
image before changing a screen's layout.

Design tokens live in `src/theme/`. Mock data lives in `src/data/mock.ts`.
All five tabs share: pure-black bg, custom bottom tab bar, yellow XTRA promo bar.

Legend: 🟡 yellow `#F5C518` · 🟣 purple `#B026FF` · 🟢 green `#27E36B` · 🩷 pink `#FF1FA2`

---

## App flow (navigation order)

```
Splash (mask)                       app/index.tsx
  → Onboarding
      Welcome                       app/onboarding/index.tsx
      Terms of Service              app/onboarding/terms.tsx
      Privacy Policy                app/onboarding/privacy.tsx
      Feature carousel (4 slides)   app/onboarding/intro.tsx
      Login                         app/onboarding/login.tsx
  → (tabs)  [Browse | Right Now | Interest | Inbox | Store]
      Browse  ──tap tile──▶ Profile detail ──▶ Chat
              ──search────▶ Explore (map)
              ──filter────▶ Filters
              ──banner────▶ Grindr Presents ──▶ Presents detail
              ──Boost─────▶ Boost (10x/40x)
              ──avatar────▶ Settings ──▶ Edit Profile
      Interest / Inbox / Store ──▶ Upgrade (XTRA/UNLIMITED)
```

---

## 1. Splash — `app/index.tsx`
Grindr **mask logo** (🟡, `GrindrMask` SVG) centred on black, spring/fade-in
animation, auto-routes to `/onboarding` after ~1.6s. To boot straight into the
app, change the `router.replace` target to `/(tabs)`.

## 2. Welcome — `app/onboarding/index.tsx`
Mask + "GRINDR" wordmark (letter-spacing 6) + tagline "Zero feet away".
Footer: 🟡 **Create Account** pill → terms; text link **Log In** → login.

## 3. Terms of Service — `app/onboarding/terms.tsx`
Uses shared `LegalScreen` component. Close (✕) header, scrollable numbered
sections, sticky bottom 🟡 **I Agree** → privacy. Body text is representative
(not Grindr's real legalese). _Ref: `flow1-onboarding-sheet.jpg` (the long ToS
scroll dominates `flow1.mp4`)._

## 4. Privacy Policy — `app/onboarding/privacy.tsx`
Same `LegalScreen` pattern; 🟡 **I Agree** → intro carousel.

## 5. Feature carousel — `app/onboarding/intro.tsx`
4 paged slides (FlatList, `pagingEnabled`): *Building Better Products for You*,
*AI for Personalization & Connection*, *No More Boundaries*, *If They're Into
You, You'll Know*. Each: circular icon bubble (🟡 Ionicon), 2-line heavy title,
body. 🟡 progress dots (active = wide). CTA **Continue** / **Get Started** →
login. Skip link top-right. _Ref: `flow1-onboarding-sheet.jpg`._

## 6. Login — `app/onboarding/login.tsx`
Mask, Email + Password inputs (`surfaceInput` bg), forgot-password (🟡), 🟡
**Log In**, "or" divider, **Continue with Google / Apple** outline buttons. Any
action → `router.replace('/(tabs)')`. Purely visual (no auth).

---

## 7. Bottom Tab Bar — `app/(tabs)/_layout.tsx`
Custom tab bar (`CustomTabBar`). 5 tabs, each with custom icon + label:

| Tab        | Icon                         | Active tint | Notes |
|------------|------------------------------|-------------|-------|
| Browse     | `GrindrMask` (SVG)           | 🟡          | home |
| Right Now  | `Droplets` (SVG, 3 teardrops)| 🟣          | only purple tab |
| Interest   | `Flame` (SVG)                | 🟡          | red notification dot |
| Inbox      | chatbubble (Ionicon)         | 🟡          | red notification dot |
| Store      | "XTRA" bordered box          | 🟡          | text glyph |

Inactive tint `textMuted`. Height ~58 + safe-area inset.

## 8. Browse (Home) — `app/(tabs)/index.tsx`  ·  _Ref: `ref-browse-header.jpg`, `ref-browse-foryou.jpg`, `ref-browse-ads.jpg`_
The cascade grid + home surface. Top → bottom:
- **Header:** round avatar (🟢 online dot) → opens Settings; search pill
  "Explore more profiles" → opens Explore map.
- **Filter chips:** ✕round filter icon, ★ icon, then `Online / Right Now / Age /
  Position / Fresh / Tribes`. Active chip = white (black text); **Right Now**
  active = 🟣 with droplets glyph. Horizontal scroll.
- **Grindr Presents banner:** 🟣 gradient card, "Thanks for coming…", **Watch
  Now**, "GRINDR EXCLUSIVE" badge → Presents.
- **For You carousel** (`ForYouCarousel`): "✱ For You" row of 150×200 cards with
  label + "1hr left" (🟡). → Right Now.
- **3-column cascade grid** of `ProfileTile`s (photo, bottom gradient, 🟢 online
  dot + name + emoji, optional 🟡 FRESH tag). Tap → Profile detail.
- **In-feed ad bands** (`AdBand`) injected after grid rows 3 and 7: "Ads help
  keep Grindr free", image, advertiser + headline + blue INSTALL/GET CTA, "Ads
  served by Meta".
- **Floating actions** (`FloatingActions`): **Boost** (🟢 bolt) → Boost screen;
  **Right Now** (🟣 droplet badge) → Right Now tab.
- **XTRA banner** (`XtraBanner`): 🟡 bar "XTRA — Get 600 Profiles" → Upgrade.

> Implemented as a single-column FlatList whose items are `foryou | grid | ad`
> rows so full-width ads can sit between 3-up grid rows (`numColumns` can't mix).

## 9. Right Now — `app/(tabs)/right-now.tsx`  ·  _Ref: `ref-right-now.jpeg`, `ref-right-now-create.jpg`_
Title "Right Now"; chip row (Distance sort, Hosting, Position, Age). Bottom
creation **sheet** (`#141414`, rounded top, drag handle):
- Header: ⓘ · "Right Now" + "Pending 59m left" · 🟣 toggle.
- Input card: avatar with 🟣 pencil badge, "What are you looking for?" multiline,
  `0/140` counter.
- "Hosting" row (🟣 home icon) + 🟣 toggle.
- 🟣 **Start** pill.

## 10. Interest — `app/(tabs)/interest.tsx`  ·  _Ref: `ref-interest-views.jpeg`, `ref-interest-taps.jpeg`_
Title "Interest"; two sub-tabs **Views 8** / **Taps 1** (taps has 🔴 dot),
animated underline. **Each sub-tab FlatList has a distinct `key`** (`"views"` /
`"taps"`) — required because they differ in `numColumns` (2 vs 1); without it RN
throws "Changing numColumns on the fly".
- **Views:** 2-col grid of **blurred locked** tiles; first has "Unlock 🟡FREE"
  tag; each shows 👁 Yesterday + distance.
- **Taps:** single-column rows: blurred thumb, "104 km away", Yesterday + 🔥.
- Floating Boost/Right Now; sticky 🟡 **Unlock All With Unlimited** /
  **Unlock To See All**; bottom "Get unlimited profiles and more" promo. All →
  Upgrade.

## 11. Inbox — `app/(tabs)/inbox.tsx`  ·  _Ref: `ref-inbox.jpeg`_
Segmented title **Inbox / Albums** (inactive = muted).
Chip row: ★, Unread, Distance, Online.
- **Inbox segment:** `AlbumsRow` header ("Update your album" ⊕ white circle +
  story circles + "No recent shared album updates…"), then conversation rows:
  64px thumb (🟢 dot), name, time, preview (forwarded ↪ arrow), 🟡 unread badge.
  Tap → Chat.
- **Albums segment:** 2-col grid of `sharedAlbums` cards (locked ones blurred
  with 🔒, name + 🖼 count tag).
- Bottom: "WANT MORE ATTENTION? **Boost Now**" (🟢 bolt) → Boost.
- Both lists use distinct `key`s (`inbox`/`albums`) for the numColumns switch.

## 12. Store — `app/(tabs)/store.tsx`
🟡 header "XTRA — Get 600 Profiles". **ADD-ONS:** Boost (🟢→Boost),
Right Now (🟣, "2 FREE" badge →Upgrade), Roam. **CHOOSE A PLAN:** 🟡 "Get XTRA —
Chat with 5X More Locals Now" card with → arrow; dark "Buy Unlimited Day Pass —
Only ₹1,400.00". All → Upgrade.

---

## 13. Profile detail — `app/profile/[id].tsx`  ·  _Ref: `ref-profile-detail.jpg`_
Square hero photo with translucent back / star / ⋯ buttons. Below (scrolls up
over photo in real app): "✱ For You" tag, **Name emoji age**, 🟢 online + ↗
distance, stats row (↓ position | height | weight | body), **MY TAGS** chips,
**ABOUT ME** card. Sticky bottom message bar: 🟡-dash icon + "Say something…" →
Chat. _TODO: drag-up sheet gesture + multi-photo pager._

## 14. Chat — `app/chat/[id].tsx`
Header: ← back, tappable profile (thumb + name + "Online now · N km away") → Profile, ⋮.
Message bubbles: mine = 🟡 (black text, right), theirs = `surfaceElevated`
(white text, left), timestamp under each. Composer: 🖼 / 😊 icons, rounded input,
🟡 round send (↑). Sending appends locally to state.

## 15. Filters — `app/filters.tsx` (modal)
✕ / "Filters" / 🟡 Reset. **Right Now** 🟡 toggle. **Age** range with 🟡 track +
two knobs + "18 Years & Over". **Position** 2-col selectable grid (Top, Vers Top,
Versatile, Vers Bottom, Bottom, Side, Not Specified) — selected = 🟡. **Photos**
grid (Has Photos / face pics / album(s)). Sticky 🟡 **Apply** → back.

## 16. Explore (map) — `app/explore.tsx` (modal)  ·  _Ref: `ref-explore-map.jpg`_
Stylised **faux dark map** (grid lines + diagonal river + scattered grey pins) —
**no map SDK / API key** to stay backend-free. Centre self-pin with 🟢 glow + ⚡.
✕ top-right. Bottom: 🎯 locate button + "Bengaluru, Karnataka" search box +
**Apply**. _TODO (optional): swap for `react-native-maps` if a key is provided._

## 17. Upgrade — `app/upgrade.tsx` (modal)  ·  _Ref: `ref-upgrade.jpg`_
"Choose to Upgrade" + ✕. White-pill **XTRA / UNLIMITED** toggle. Plan cards
(WEEK / MONTH / MONTHS) with count, price, "Save %" tag, 🟡 selected border,
"POPULAR" ribbon. Feature list (🟡 icons: multiple albums, shared albums, no 3rd
party ads, read receipts, favourite phrases, mark recently chatted) + disclaimer.
Footer: price line + 🟡 **Continue** + auto-renew fine print.

## 18. Boost — `app/boost.tsx` (modal)
🟢 dark-green gradient. ⚡ bolt circle, "Get Seen by More" + blurb. Three tiers
("10x More / 40x More" views, count + price, 🟢 selected border, "MOST POPULAR"
ribbon). Sticky 🟢 **Boost Now** (⚡). _Ref: green "10x/40x More" frames in
`flow2.mp4` ~sheet 8._

## 19. Grindr Presents hub — `app/presents/index.tsx`  ·  _Ref: `ref-presents-hub.jpg`_
← back + 🟡 "Grindr". Hero card (image + dark gradient + "🎭 Grindr presents" +
title + 🩷 **Watch Now**). Horizontal rows ("Our Tops", "Host or Travel") of
200×120 video cards (thumb, 2-line title, duration). Tap → Presents detail.

## 20. Presents detail — `app/presents/[id].tsx`  ·  _Ref: `ref-presents-detail.jpg`_
← + 🟡 "Grindr". Large poster with centred play overlay, 🩷 **Watch Now**, title +
subtitle, bottom control bar (prev/next/repeat/share, 🟡 active). _TODO: real
video via `expo-av`/`expo-video`._

## 21. Settings / side menu — `app/settings/index.tsx` (modal)
✕ + 🟡 Upgrade. Profile header (avatar with 🟣 pencil, "San", 🟢 Online +
Incognito chips) → Edit Profile. Menu rows: Grindr Presents, Edit Profile, My
Albums, Mpox Resources, Safety & Privacy Center, Settings.

## 22. Edit Profile — `app/settings/edit-profile.tsx`  ·  _Ref: `ref-edit-profile.jpg`_
← / "Edit Profile" / 🟡 Done. 3-col photo grid (first filled, rest dashed ⊕).
Grouped fields (ABOUT ME, STATS, SEXUAL HEALTH, SOCIAL) as label + value
("No response" muted) + chevron. Sexual Health FAQ blurb at the bottom.

---

## TODO / polish backlog (optional, for a future session)
- [ ] Bundle real **Sharp Sans**-like font via `expo-font` (currently system sans).
- [ ] Profile detail: gesture-driven **drag-up info sheet** + horizontal **photo pager**.
- [ ] Chat: image messages, gaymoji picker, saved phrases, taps.
- [ ] Presents: actual **video playback** (`expo-video`).
- [ ] Explore: optional real map via `react-native-maps` (needs API key).
- [ ] Right Now: live grid of nearby Right Now profiles above the create sheet.
- [ ] Persist onboarding "seen" + login state (AsyncStorage) so splash can skip it.
- [ ] Replace picsum placeholders with bundled neutral silhouette assets for offline use.
- [ ] Pull-to-refresh + skeleton loaders on Browse/Inbox.

## Notes for whoever continues this
- No backend by design. If asked to wire a real API, add a `src/api/` layer and
  swap `src/data/mock.ts` reads for fetches — keep components unchanged.
- Keep all imagery non-explicit regardless of the reference content.
- Re-run `npx tsc --noEmit` and `npx expo export --platform web` after changes;
  both should exit 0 (this is the cheapest "does it still build" check).
