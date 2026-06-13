# Grindr UI Clone — Project Guide (for Claude / new sessions)

> **What this is:** A **frontend-only**, pixel-faithful UI replica of the Grindr
> mobile app, built in **React Native + Expo (SDK 56) + expo-router**.
> There is **NO backend** — everything runs on local mock data
> (`src/data/mock.ts`) and placeholder images (picsum). The goal is to reproduce
> every screen and the navigation flow seen in the reference recordings, not to
> implement real messaging/matching/auth.

This file is the entry point for any AI session picking up the work. Read it
fully, then read **`docs/SCREENS.md`** for the screen-by-screen spec and
**`docs/reference/`** for annotated reference screenshots.

---

## How to run

```bash
npm install            # if node_modules is missing (use --legacy-peer-deps if peer errors)
npx expo start         # then press i (iOS), a (Android), or w (web)
# Sanity-check a build without a device:
npx tsc --noEmit
npx expo export --platform web --output-dir /tmp/gc-web   # must exit 0
```

> ⚠️ **Dependency note:** the template ships `react@19.2.3` but `react-dom`
> resolves to `19.2.7`, which makes plain `npx expo install` fail an `ERESOLVE`
> peer check. Install extra native modules with **`npm install <pkg> --legacy-peer-deps`**
> (or `npx expo install` then re-pin `react-dom@19.2.3`). `react-native-reanimated@4`
> requires `react-native-worklets` (already installed) — keep it.

## Tech stack

| Concern        | Choice                                            |
| -------------- | ------------------------------------------------- |
| Framework      | Expo SDK 56, React Native 0.85, React 19          |
| Routing        | `expo-router` (file-based, in `app/`)             |
| Language       | TypeScript (strict)                               |
| Icons          | `@expo/vector-icons` (Ionicons) + custom SVG logo |
| Vector logo    | `react-native-svg` (`src/components/icons.tsx`)   |
| Gradients      | `expo-linear-gradient`                            |
| Images         | `expo-image` (remote picsum placeholders)         |
| State          | Local `useState` only — no global store, no API   |

## Project structure

```
app/                         # expo-router routes (file = screen)
  _layout.tsx                # root Stack; registers every screen + transitions
  index.tsx                  # splash (Grindr mask) -> /onboarding
  onboarding/
    _layout.tsx              # nested stack
    index.tsx                # Welcome (Create Account / Log In)
    terms.tsx                # Terms of Service (scroll + I Agree)
    privacy.tsx              # Privacy Policy (scroll + I Agree)
    intro.tsx                # 4-slide feature carousel
    login.tsx                # email/password + social -> /(tabs)
  (tabs)/
    _layout.tsx              # custom bottom tab bar (5 tabs)
    index.tsx                # BROWSE  (cascade grid) — home
    right-now.tsx            # RIGHT NOW (create status sheet)
    interest.tsx             # INTEREST (Views / Taps, locked grid)
    inbox.tsx                # INBOX (conversations + albums row)
    store.tsx                # STORE (XTRA add-ons + plans)
  profile/[id].tsx           # full profile detail + message bar
  chat/[id].tsx              # 1:1 conversation
  filters.tsx               # Filters modal
  explore.tsx               # Explore / set-location faux map (modal)
  upgrade.tsx               # "Choose to Upgrade" XTRA/UNLIMITED (modal)
  presents/index.tsx        # Grindr Presents hub (video rows)
  presents/[id].tsx         # Grindr Presents video detail/player
  settings/index.tsx        # side menu (modal)
  settings/edit-profile.tsx # Edit Profile form
src/
  theme/                     # colors.ts + index.ts (spacing/radius/font/layout)
  components/                # icons, ui primitives, ProfileTile, store-bits, LegalScreen
  data/mock.ts               # ALL data: profiles, conversations, presents, plans...
docs/
  SCREENS.md                 # screen-by-screen spec + status + TODO
  reference/                 # reference screenshots + montage sheets
```

## Design system (see `src/theme/colors.ts`)

- **Background:** pure OLED black `#000000`. Surfaces `#1A1A1A` / `#262626`.
- **Brand amber/yellow** `#F5C518` — store, banners, primary CTAs, active tabs.
- **Purple** `#B026FF` — *Right Now* / Gaymoji identity (RN tab, RN chip, Start).
- **Green** `#27E36B` — *Boost* lightning + map self-pin glow.
- **Pink** `#FF1FA2` — *Grindr Presents* "Watch Now".
- **Online dot** green; unread badge yellow with black number.
- Typography: system sans (Grindr's real face is *Sharp Sans*; swap in via
  `expo-font` if exact match is needed). Weights skew bold/heavy for titles.
- Spacing/radius tokens in `src/theme/index.ts`. Use them, don't hardcode.

## Conventions

- Every screen is a default-exported component in `app/`. Use the `T` text
  primitive and `PillButton`/`ChipRow` from `src/components/ui.tsx` where they fit.
- Navigation: `useRouter()` + `router.push('/path')`. Modals declared in
  `app/_layout.tsx` with `presentation: 'modal'`.
- Reuse `ProfileTile`, `XtraBanner`, `FloatingActions` instead of re-implementing.
- Don't introduce a backend, auth, or networking. Mock everything in `src/data`.
- Avoid `StyleSheet.absoluteFillObject` (strict types reject it) — use an explicit
  `{ position:'absolute', top:0,left:0,right:0,bottom:0 }` object.
- Keep imagery non-explicit: use picsum placeholders / gray silhouettes. The
  reference app is adult-oriented; the clone must NOT reproduce explicit content.

## Status

✅ **All screens built & compiling** (`npx tsc --noEmit` and `expo export` both
pass): onboarding (splash, welcome, terms, privacy, intro, login), all 5 tabs,
profile detail, chat, filters, explore map, upgrade, **boost (10x/40x)**, store,
Grindr Presents (hub + detail), settings menu, edit profile.
Browse includes the **"For You" carousel** and **in-feed Meta ad bands**; Inbox
includes the **Albums** tab grid.

🔧 Remaining polish (nice-to-have) — see the **TODO** section at the bottom of
`docs/SCREENS.md` (real *Sharp Sans* font, swipe-up gesture on profile detail,
profile photo pager, gaymoji keyboard, video playback in Presents, etc.).

## Reference source of truth

Built from two screen recordings + four screenshots the user provided
(`flow1.mp4` = onboarding/legal/store, `flow2.mp4` = main app usage). Distinct
frames were extracted to `docs/reference/`. When in doubt about a screen, open
the matching `docs/reference/ref-*.jpg` before guessing.
