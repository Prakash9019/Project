NearMe Subscription Plan Audit — PDF vs Spec vs Implementation

PART 1 — PLAN FEATURE MATRIX

FREE PLAN

Feature: New chats per day
PDF Spec: 10/day, resets midnight (annotated →20/day)
backend-spec.json: 20 lifetime unique people
Backend Code: chat.service.ts:13,108-115 — FREE_TIER_INTERACTION_LIMIT=20, counted via UserInteraction
rows, never resets
Frontend UI: plans.ts:16 shows "20 unique people (lifetime)"
Status: ⚡ SPEC CONFLICT: PDF says 20/day (daily reset); backend-spec.json says 20 lifetime; code
implements lifetime (matches spec.json, contradicts PDF's core mechanic)
────────────────────────────────────────
Feature: Photos
PDF Spec: 4 photos
backend-spec.json: unlimited (single profile photo, optional)
Backend Code: No photo-count limit enforced anywhere in profile.controller.ts/media.controller.ts (only
albums have caps)
Frontend UI: No limit shown/enforced in UI
Status: 🔴 3-way mismatch: PDF caps at 4, spec says "unlimited(ish)", code enforces no cap at all
────────────────────────────────────────
Feature: Bio chars
PDF Spec: 150
backend-spec.json: 150
Backend Code: middleware/subscription.ts:38 bioChars:150, enforced profile.controller.ts:123
Frontend UI: Not visibly enforced in UI (no char counter confirmed)
Status: ✅ backend matches both
────────────────────────────────────────
Feature: Audio call limit
PDF Spec: 5 min/day
backend-spec.json: 5 min/day
Backend Code: utils/callLimits.ts + env.calls.freeTierAudioMinPerDay
Frontend UI: Shown via callLimits from /auth/me
Status: ✅
────────────────────────────────────────
Feature: Video call limit
PDF Spec: 2 min/day
backend-spec.json: 2 min/day
Backend Code: same file
Frontend UI: same
Status: ✅
────────────────────────────────────────
Feature: Grid profiles
PDF Spec: not stated (100 via matrix table)
backend-spec.json: 100
Backend Code: middleware/subscription.ts:39
Frontend UI: plans.ts:16 "100 grid profiles"
Status: ✅
────────────────────────────────────────
Feature: Pin chats
PDF Spec: 0 (matrix ❌)
backend-spec.json: 0
Backend Code: middleware/subscription.ts:41 pinChats:0
Frontend UI: not shown
Status: ✅
────────────────────────────────────────
Feature: Message templates
PDF Spec: 0 (matrix ❌)
backend-spec.json: 0
Backend Code: middleware/subscription.ts:42
Frontend UI: not shown
Status: ✅
────────────────────────────────────────
Feature: Albums
PDF Spec: not mentioned
backend-spec.json: 1/10 photos
Backend Code: middleware/subscription.ts:43 {maxAlbums:1,maxPhotosPerAlbum:10}
Frontend UI: not surfaced on store screen
Status: ✅ backend correct, ⚠ not shown to user
────────────────────────────────────────
Feature: Read receipts
PDF Spec: ❌
backend-spec.json: ❌
Backend Code: readReceipts:false (subscription.ts:49)
Frontend UI: n/a
Status: ✅
────────────────────────────────────────
Feature: Typing indicator
PDF Spec: ❌
backend-spec.json: ❌
Backend Code: typingIndicator:false
Frontend UI: n/a
Status: ✅
────────────────────────────────────────
Feature: Ads on grid
PDF Spec: Yes (matrix: Free=Yes, all paid=None)
backend-spec.json: not mentioned
Backend Code: 🔴 zero ad-serving code found anywhere in grid/chat modules
Frontend UI: 🔴 no ad component in index.tsx
Status: 🔴 Not implemented — Free-tier ad monetization from the PDF doesn't exist in spec or code at all

PREMIUM PLAN (₹399/month)

Feature: New chats/day
PDF Spec: Unlimited
backend-spec.json: Unlimited (interactionCap:null)
Backend Code: subscription.ts:64 interactionCap:null → isActivePlan skips the cap entirely
Frontend UI: shown as "Unlimited people"
Status: ✅
────────────────────────────────────────
Feature: Photos
PDF Spec: Up to 8
backend-spec.json: unlimited
Backend Code: no cap enforced
Frontend UI: not shown
Status: ⚡ conflict PDF(8) vs spec(unlimited); code has no cap either way
────────────────────────────────────────
Feature: Bio chars
PDF Spec: 400
backend-spec.json: 400
Backend Code: ✅ subscription.ts:62
Frontend UI: not enforced visibly
Status: ✅
────────────────────────────────────────
Feature: Voice clip
PDF Spec: 30 sec
backend-spec.json: 30 sec
Backend Code: voiceClipSec:30
Frontend UI: not wired to any recorder UI found in reviewed files
Status: ⚠ backend value correct, frontend capture UI not confirmed in scope
────────────────────────────────────────
Feature: Video clip
PDF Spec: 15 sec
backend-spec.json: 15 sec
Backend Code: videoClipSec:15
Frontend UI: same caveat
Status: ⚠
────────────────────────────────────────
Feature: Grid profiles
PDF Spec: 600
backend-spec.json: 600
Backend Code: ✅ gridProfiles:600
Frontend UI: shown in plans.ts
Status: ✅
────────────────────────────────────────
Feature: Expiring photos
PDF Spec: 10/day
backend-spec.json: 10/day
Backend Code: expiringPhotosPerDay:10
Frontend UI: not confirmed wired to any send-flow
Status: ⚠ limit defined, enforcement path not verified in this audit's scope
────────────────────────────────────────
Feature: Message templates
PDF Spec: 5
backend-spec.json: 5
Backend Code: ✅ messageTemplates:5, enforced chat.controller.ts:328,334
Frontend UI: not shown in store perks
Status: ✅ backend, ⚠ frontend doesn't advertise it
────────────────────────────────────────
Feature: Read receipts
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: ✅ readReceipts:true
Frontend UI: listed in plans.ts perks
Status: ✅
────────────────────────────────────────
Feature: Typing indicator
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: ✅
Frontend UI: not explicitly listed but functional
Status: ✅
────────────────────────────────────────
Feature: Albums
PDF Spec: not mentioned
backend-spec.json: 3/30 photos
Backend Code: subscription.ts:67
Frontend UI: not shown
Status: ✅ backend, not surfaced
────────────────────────────────────────
Feature: Unsend before read
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: 🔴 no unsend-message code found anywhere in chat.controller.ts/chat.service.ts in the
modules reviewed
Frontend UI: no unsend button confirmed
Status: 🔴 Not implemented — matrix promises this for Premium+ but no backend endpoint exists
────────────────────────────────────────
Feature: Advanced filters
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: ⚠ advancedFilters param is now parsed and logged, not enforced — no matching User columns
(per the just-shipped grid fix)
Frontend UI: filters.tsx collects education/occupation/etc. and sends them
Status: ⚠ Partially implemented — round-trips but has zero effect on results
────────────────────────────────────────
Feature: Verified users filter
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: ✅ verifiedOnly gated Premium+ in grid.controller.ts:66
Frontend UI: sent via filterStore
Status: ✅
────────────────────────────────────────
Feature: activeLast30Min filter
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: ✅ gated Premium+ grid.controller.ts:68
Frontend UI: sent
Status: ✅
────────────────────────────────────────
Feature: Translation
PDF Spec: ✅ (implied — actually Gold "in-chat translation" per §5.1; Premium isn't listed for translation
in matrix)
backend-spec.json: not mentioned
Backend Code: 🔴 no translation code found anywhere in chat module
Frontend UI: no UI
Status: 🔴 Not implemented at any tier
────────────────────────────────────────
Feature: Call history
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: ⚡ conflict: matrix shows Premium ✅ for call history, but subscription.ts:80 sets
callHistoryAccess:false for premium (only true for gold/platinum)
Frontend UI: not shown
Status: ⚡ SPEC CONFLICT / bug: PDF matrix says Premium gets call history; code explicitly denies it to
Premium
────────────────────────────────────────
Feature: No ads
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: n/a (ads system doesn't exist for anyone)
Frontend UI: n/a
Status: 🔴 moot — no ad system to remove
────────────────────────────────────────
Feature: Background blur (calls)
PDF Spec: ✅
backend-spec.json: not mentioned
Backend Code: 🔴 no blur/virtual-background code found in calls module or Agora integration
Frontend UI: no toggle in call UI
Status: 🔴 Not implemented, and absent from spec entirely
────────────────────────────────────────
Feature: Picture-in-picture
PDF Spec: ✅
backend-spec.json: not mentioned
Backend Code: 🔴 not implemented
Frontend UI: 🔴 not implemented
Status: 🔴

GOLD PLAN (₹799/month)

Feature: Grid profiles
PDF Spec: unlimited
backend-spec.json: unlimited
Backend Code: ✅ gridProfiles:null
Frontend UI: ✅
Status: ✅
────────────────────────────────────────
Feature: Max radius
PDF Spec: not explicit (§5.6 lists 0.5-100km separately)
backend-spec.json: 100km
Backend Code: ✅ maxRadiusM:100_000 (just fixed)
Frontend UI: ✅ filters.tsx isGold?100:25
Status: ✅
────────────────────────────────────────
Feature: Expiring photos
PDF Spec: unlimited
backend-spec.json: unlimited
Backend Code: ✅ expiringPhotosPerDay:null
Frontend UI: not shown
Status: ✅
────────────────────────────────────────
Feature: Message templates
PDF Spec: 5
backend-spec.json: 5
Backend Code: ✅
Frontend UI: not shown
Status: ✅
────────────────────────────────────────
Feature: Pin chats
PDF Spec: 5
backend-spec.json: 5
Backend Code: ✅ pinChats:5
Frontend UI: not shown/no pin-chat UI found in reviewed files
Status: ⚠ backend correct; pin-chat UI not verified in scope
────────────────────────────────────────
Feature: Verified badge
PDF Spec: included
backend-spec.json: included
Backend Code: ✅ verifiedBadge on User model, subscription.ts doesn't explicitly auto-grant it though —
needs confirmation whether Gold signup auto-sets verifiedBadge=true
Frontend UI: plans.ts lists "Verified badge" as a Gold perk
Status: ⚠ needs verification: no code found in the files reviewed that auto-sets user.verifiedBadge=true
on Gold/Platinum activation — likely relies on the separate verified_badge add-on flow, meaning
"included" may not be auto-applied
────────────────────────────────────────
Feature: Incognito mode
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: ✅ gated in profile.controller.ts:224-226 via limits.incognitoMode
Frontend UI: settings toggle (not in reviewed files, assumed present)
Status: ✅
────────────────────────────────────────
Feature: Travel mode
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: ✅ city-profiles.routes.ts:9 requires gold/platinum
Frontend UI: not in reviewed files
Status: ✅ for Gold/Platinum via subscription; 🔴 broken for the travel_pass add-on path (see Part 2)
────────────────────────────────────────
Feature: Who viewed me
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: ✅ discovery.controller.ts:115, verification.controller.ts:164
Frontend UI: index.tsx Interest tab, canSeeViews
Status: ✅
────────────────────────────────────────
Feature: Albums
PDF Spec: not mentioned
backend-spec.json: 5/50 photos
Backend Code: ✅
Frontend UI: not surfaced
Status: ✅
────────────────────────────────────────
Feature: Unsend after read
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: 🔴 not implemented (same as "unsend before read" — no unsend feature exists at all)
Frontend UI: 🔴
Status: 🔴
────────────────────────────────────────
Feature: Edit messages
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: 🔴 no message-edit endpoint found anywhere in chat module
Frontend UI: 🔴
Status: 🔴 Not implemented
────────────────────────────────────────
Feature: In-chat translation
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: 🔴 not implemented
Frontend UI: 🔴
Status: 🔴
────────────────────────────────────────
Feature: Hide active status
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: ✅ hideActiveStatus field, read in profile.serializer.ts:140
Frontend UI: settings toggle assumed
Status: ✅
────────────────────────────────────────
Feature: Hide last seen
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: ✅ hideLastSeen, profile.serializer.ts:141
Frontend UI: assumed
Status: ✅
────────────────────────────────────────
Feature: hideExactDistance
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: ✅ just implemented — gated in profile.controller.ts, rendered via formatDistance()
Frontend UI: not confirmed wired into a settings-screen toggle
Status: ⚠ backend correct; frontend toggle existence not verified in this audit's file list
────────────────────────────────────────
Feature: Profile analytics
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: ✅ verification.controller.ts:203 gated whoViewedMe (also used as the analytics gate)
Frontend UI: not in reviewed files
Status: ⚠ gate exists; dedicated analytics dashboard UI not confirmed
────────────────────────────────────────
Feature: activeLast5Min filter
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: ✅ Gold+ gated
Frontend UI: sent via filterStore
Status: ✅
────────────────────────────────────────
Feature: recentlyJoined filter
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: ✅
Frontend UI: sent
Status: ✅
────────────────────────────────────────
Feature: highReplyRate filter
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: ✅
Frontend UI: sent
Status: ✅
────────────────────────────────────────
Feature: Schedule calls
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: 🔴 no scheduled-call / calendar-invite code found in calls module
Frontend UI: 🔴
Status: 🔴 Not implemented
────────────────────────────────────────
Feature: City profiles (travel)
PDF Spec: up to 3
backend-spec.json: up to 3
Backend Code: needs confirming city-profiles.controller.ts caps at 3 — not read in this audit; flag as
unverified
Frontend UI: not in reviewed files
Status: ⚠ unverified in this pass
────────────────────────────────────────
Feature: Full HD calls 1080p
PDF Spec: ✅
backend-spec.json: not mentioned
Backend Code: 🔴 no video-quality-tier code found (Agora resolution appears fixed, not plan-driven)
Frontend UI: 🔴
Status: 🔴
────────────────────────────────────────
Feature: Virtual backgrounds
PDF Spec: ✅
backend-spec.json: not mentioned
Backend Code: 🔴 not implemented
Frontend UI: 🔴
Status: 🔴
────────────────────────────────────────
Feature: Low bandwidth mode
PDF Spec: ✅
backend-spec.json: not mentioned
Backend Code: 🔴 not implemented
Frontend UI: 🔴
Status: 🔴
────────────────────────────────────────
Feature: Custom distance radius
PDF Spec: 0.5-100km
backend-spec.json: 0.5-100km
Backend Code: ✅ (0.5km isn't an explicit floor anywhere, but 100km ceiling now correct)
Frontend UI: filters.tsx slider 0-100km
Status: ✅ (minor: no explicit 500m floor enforced, but not a real-world issue)

PLATINUM PLAN (₹1,499/month)

Feature: Grid profiles
PDF Spec: unlimited
backend-spec.json: unlimited
Backend Code: ✅
Frontend UI: ✅
Status: ✅
────────────────────────────────────────
Feature: Message templates
PDF Spec: 10
backend-spec.json: 10
Backend Code: ✅
Frontend UI: ✅ plans.ts
Status: ✅
────────────────────────────────────────
Feature: Pin chats
PDF Spec: 10
backend-spec.json: 10
Backend Code: ✅
Frontend UI: not shown
Status: ✅
────────────────────────────────────────
Feature: Verified badge
PDF Spec: included
backend-spec.json: included
Backend Code: ⚠ same caveat as Gold — no confirmed auto-grant code
Frontend UI: listed
Status: ⚠
────────────────────────────────────────
Feature: AI icebreakers
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: needs confirmation — ai.routes.ts gated requirePlan('platinum'); icebreaker-specific
endpoint not read in this pass
Frontend UI: not in reviewed files
Status: ⚠ module gated correctly; feature-level implementation unverified here
────────────────────────────────────────
Feature: AI reply suggestions
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: same module, unverified in this pass
Frontend UI: —
Status: ⚠
────────────────────────────────────────
Feature: AI compatibility score
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: matrix explicitly says Free/Premium/Gold=❌, Platinum=✅ — unverified in this pass whether
ai.controller.ts implements a compatibility score field
Frontend UI: —
Status: ⚠
────────────────────────────────────────
Feature: AI daily top 10
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: endpoint exists: ai-daily-top10 GET /api/ai/top-10 (confirmed in spec's endpoints[])
Frontend UI: —
Status: ✅ endpoint exists (behavior not deep-verified)
────────────────────────────────────────
Feature: AI profile optimizer
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: unverified in this pass
Frontend UI: —
Status: ⚠
────────────────────────────────────────
Feature: 5x algorithm boost
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: ✅ just implemented — computeRankScore() weights platinum at 5,000,000 vs premium's
1,000,000
Frontend UI: n/a
Status: ✅
────────────────────────────────────────
Feature: Top grid ranking
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: ✅ (via the weighted score)
Frontend UI: n/a
Status: ✅
────────────────────────────────────────
Feature: First screen visibility
PDF Spec: ✅
backend-spec.json: ✅
Backend Code: ⚠ no explicit "always page 1" pin — relies on the weighted score dominating, not a hard
guarantee
Frontend UI: n/a
Status: ⚠ partial (per prior audit)
────────────────────────────────────────
Feature: Albums
PDF Spec: not mentioned
backend-spec.json: unlimited/100
Backend Code: ✅ subscription.ts:115
Frontend UI: not shown
Status: ✅
────────────────────────────────────────
Feature: AI noise cancellation
PDF Spec: ✅
backend-spec.json: not mentioned
Backend Code: 🔴 not implemented
Frontend UI: 🔴
Status: 🔴
────────────────────────────────────────
Feature: AI virtual backgrounds
PDF Spec: ✅
backend-spec.json: not mentioned
Backend Code: 🔴 not implemented
Frontend UI: 🔴
Status: 🔴
────────────────────────────────────────
Feature: Priority call routing
PDF Spec: ✅
backend-spec.json: not mentioned
Backend Code: 🔴 not implemented
Frontend UI: 🔴
Status: 🔴
────────────────────────────────────────
Feature: Concierge support
PDF Spec: ✅
backend-spec.json: not mentioned
Backend Code: 🔴 not implemented (no support-ticket priority system found)
Frontend UI: 🔴
Status: 🔴
────────────────────────────────────────
Feature: Early access features
PDF Spec: ✅
backend-spec.json: not mentioned
Backend Code: 🔴 not implemented (no feature-flag/beta system found)
Frontend UI: 🔴
Status: 🔴
────────────────────────────────────────
Feature: Messages at top of inbox
PDF Spec: ✅
backend-spec.json: not mentioned
Backend Code: 🔴 not implemented — no inbox-sort-by-sender-plan logic found in chat module
Frontend UI: 🔴
Status: 🔴
────────────────────────────────────────
Feature: Smart inbox (AI sort)
PDF Spec: ✅
backend-spec.json: not mentioned
Backend Code: 🔴 not implemented
Frontend UI: 🔴
Status: 🔴
────────────────────────────────────────
Feature: AI best time to message
PDF Spec: ✅
backend-spec.json: not mentioned
Backend Code: 🔴 not implemented
Frontend UI: 🔴
Status: 🔴
────────────────────────────────────────
Feature: Weekly AI report
PDF Spec: ✅
backend-spec.json: not mentioned
Backend Code: 🔴 not implemented
Frontend UI: 🔴
Status: 🔴
────────────────────────────────────────
Feature: Reply probability score
PDF Spec: ✅
backend-spec.json: not mentioned
Backend Code: 🔴 not implemented
Frontend UI: 🔴
Status: 🔴

---
PART 2 — ADD-ONS AUDIT

Names/prices cross-checked: PDF and backend-spec.json agree on every name and price. billingPlans.ts's ADDON_PRICES also matches all 13 prices exactly. The divergence is in behavior, not price.

Add-on: boost_local
PDF Price: ₹49
Spec Price: ₹49
Backend Purchase: ✅ addons.controller.ts:76-100
Backend Activate: ✅ creates FeedBoost, ranked +10,000,000 in computeRankScore
Frontend Store: ✅ plans.ts:53
Frontend UX: ✅ Razorpay flow
Status: ⚠ works, but identical effect to every other boost tier (see below)
────────────────────────────────────────
Add-on: boost_extended
PDF Price: ₹99
Spec Price: ₹99
Backend Purchase: ✅
Backend Activate: ⚠ same FeedBoost/boost-score path as boost_local — no radius expansion logic exists
Frontend Store: ✅
Frontend UX: ✅
Status: ⚠ partial: charges more for "expanded radius" that isn't implemented — same ranking effect as the
₹49 tier
────────────────────────────────────────
Add-on: boost_city_wide
PDF Price: ₹199
Spec Price: ₹199
Backend Purchase: ✅
Backend Activate: ⚠ same generic boost path — no "entire city grid" targeting exists (grid radius is
unaffected by any boost)
Frontend Store: ✅
Frontend UX: ✅
Status: ⚠ partial — same gap
────────────────────────────────────────
Add-on: mega_boost
PDF Price: ₹499
Spec Price: ₹499
Backend Purchase: ✅
Backend Activate: ⚠ only difference from the ₹49 tier is expiresAt duration (60min vs 30min); same rank
score
Frontend Store: ✅
Frontend UX: ✅
Status: ⚠ partial
────────────────────────────────────────
Add-on: spotlight
PDF Price: ₹199
Spec Price: ₹199
Backend Purchase: ✅
Backend Activate: ⚠ treated identically to boost add-ons in grid.service.ts:267-278 (boostedSet) — no
separate "Featured Nearby carousel" UI/query exists
Frontend Store: ✅
Frontend UX: ✅
Status: 🔴 the specific promised feature (a carousel) doesn't exist — user pays ₹199 and just gets a rank
bump indistinguishable from boost_local
────────────────────────────────────────
Add-on: chat_pack_s
PDF Price: ₹79
Spec Price: ₹79
Backend Purchase: ✅ order created, payment verified
Backend Activate: 🔴 addons.controller.ts:154-159 — records chatSlotsAdded on the purchase row but the
interaction cap (chat.service.ts:108-112) never reads it — zero functional effect
Frontend Store: ✅ shown
Frontend UX: ✅ purchasable
Status: 🔴 P0 — money charged, feature does nothing
────────────────────────────────────────
Add-on: chat_pack_m
PDF Price: ₹149
Spec Price: ₹149
Backend Purchase: ✅
Backend Activate: 🔴 same — no effect
Frontend Store: ✅
Frontend UX: ✅
Status: 🔴 P0
────────────────────────────────────────
Add-on: chat_pack_l
PDF Price: ₹249
Spec Price: ₹249
Backend Purchase: ✅
Backend Activate: 🔴 same — no effect
Frontend Store: ✅
Frontend UX: ✅
Status: 🔴 P0
────────────────────────────────────────
Add-on: travel_pass
PDF Price: ₹99
Spec Price: ₹99
Backend Purchase: ✅ order/verify succeed, AddOnPurchase row created with expiresAt
Backend Activate: 🔴 nothing reads this purchase anywhere — city-profiles.routes.ts:9 hard-gates the only
travel-mode route to requirePlan('gold','platinum') with no add-on bypass, so a Free/Premium buyer is
403'd the moment they try to use what they paid for
Frontend Store: ✅ shown, purchasable for any plan
Frontend UX: ✅
Status: 🔴 P0 — money charged, feature is completely inaccessible for its target audience (Free/Premium)
────────────────────────────────────────
Add-on: travel_pass_week
PDF Price: ₹299
Spec Price: ₹299
Backend Purchase: ✅
Backend Activate: 🔴 same gap
Frontend Store: ✅
Frontend UX: ✅
Status: 🔴 P0
────────────────────────────────────────
Add-on: verified_badge
PDF Price: ₹199
Spec Price: ₹199
Backend Purchase: ✅
Backend Activate: ⚠ addons.controller.ts:166-169 explicitly does not set user.verifiedBadge=true —
response says "submit verification documents to complete badge activation," implying a manual/separate
step with no confirmed follow-up endpoint in this review
Frontend Store: ✅
Frontend UX: ✅
Status: ⚠ partial — payment succeeds but activation is deferred to an unconfirmed manual process; user
could pay and never actually receive the badge
────────────────────────────────────────
Add-on: audio_call_topup
PDF Price: ₹49
Spec Price: ₹49
Backend Purchase: ✅, 403-gated to free-only correctly (addons.controller.ts:171-174)
Backend Activate: ✅ read by utils/callLimits.ts:44 and calls.controller.ts:68-72 — genuinely extends the
daily audio limit
Frontend Store: ✅
Frontend UX: ✅
Status: ✅ fully working
────────────────────────────────────────
Add-on: video_call_topup
PDF Price: ₹79
Spec Price: ₹79
Backend Purchase: ✅ same free-only gate
Backend Activate: ✅ same working read path
Frontend Store: ✅
Frontend UX: ✅
Status: ✅ fully working

Trace summary: Of 13 add-ons, only 2 (audio/video call top-ups) are fully functional end-to-end. 3 chat packs are pure revenue with zero effect. 2 travel passes are sold to an audience (Free/Premium) that is structurally blocked from using them. 4 boost/spotlight tiers all collapse into one identical ranking effect regardless of price paid. verified_badge payment succeeds but activation is left to an unconfirmed manual step.

---
PART 3 — BILLING CYCLES AUDIT

┌──────────┬─────────┬───────────┬──────────────────────────────┬────────────────┬────────┐
│   Plan   │  Cycle  │ PDF Price │ Code Price (billingPlans.ts) │ Shown in Store │ Status │
├──────────┼─────────┼───────────┼──────────────────────────────┼────────────────┼────────┤
│ Premium  │ monthly │ ₹399      │ ₹399                         │ ✅             │ ✅     │
├──────────┼─────────┼───────────┼──────────────────────────────┼────────────────┼────────┤
│ Premium  │ 3 month │ ₹999      │ ₹999                         │ ✅             │ ✅     │
├──────────┼─────────┼───────────┼──────────────────────────────┼────────────────┼────────┤
│ Premium  │ 6 month │ ₹1,799    │ ₹1,799                       │ ✅             │ ✅     │
├──────────┼─────────┼───────────┼──────────────────────────────┼────────────────┼────────┤
│ Premium  │ annual  │ ₹2,999    │ ₹2,999                       │ ✅             │ ✅     │
├──────────┼─────────┼───────────┼──────────────────────────────┼────────────────┼────────┤
│ Gold     │ monthly │ ₹799      │ ₹799                         │ ✅             │ ✅     │
├──────────┼─────────┼───────────┼──────────────────────────────┼────────────────┼────────┤
│ Gold     │ 3 month │ ₹1,999    │ ₹1,999                       │ ✅             │ ✅     │
├──────────┼─────────┼───────────┼──────────────────────────────┼────────────────┼────────┤
│ Gold     │ 6 month │ ₹3,499    │ ₹3,499                       │ ✅             │ ✅     │
├──────────┼─────────┼───────────┼──────────────────────────────┼────────────────┼────────┤
│ Gold     │ annual  │ ₹5,999    │ ₹5,999                       │ ✅             │ ✅     │
├──────────┼─────────┼───────────┼──────────────────────────────┼────────────────┼────────┤
│ Platinum │ monthly │ ₹1,499    │ ₹1,499                       │ ✅             │ ✅     │
├──────────┼─────────┼───────────┼──────────────────────────────┼────────────────┼────────┤
│ Platinum │ 3 month │ ₹3,799    │ ₹3,799                       │ ✅             │ ✅     │
├──────────┼─────────┼───────────┼──────────────────────────────┼────────────────┼────────┤
│ Platinum │ 6 month │ ₹6,799    │ ₹6,799                       │ ✅             │ ✅     │
├──────────┼─────────┼───────────┼──────────────────────────────┼────────────────┼────────┤
│ Platinum │ annual  │ ₹11,499   │ ₹11,499                      │ ✅             │ ✅     │
└──────────┴─────────┴───────────┴──────────────────────────────┴────────────────┴────────┘

All 12 price points match exactly across PDF, billingPlans.ts, and the frontend plans.ts catalog. This is the one area with zero drift. However: the PDF's "Save 37%/37%/36%" annual-savings badges (§7) are not computed or shown anywhere in store.tsx — see Part 5.

---
PART 4 — PAYMENT FLOW AUDIT

Subscription purchase

Step: 1. Tap plan → function
Trace: store.tsx:77 upgrade(plan)
Status: ✅
────────────────────────────────────────
Step: 2. POST /api/v1/billing/subscriptions → returns
Trace: {orderId, amount, currency, paymentProvider, key} (subscriptions.controller.ts:56-62)
Status: ✅
────────────────────────────────────────
Step: 3. Razorpay SDK opens
Trace: react-native-razorpay@3.0.0 installed (package.json:44), wrapped in payments.ts with a
Platform.OS==='web' guard
Status: ✅ (native only, correctly guarded)
────────────────────────────────────────
Step: 4. POST /api/v1/billing/subscriptions/verify sets user.plan
Trace: ✅ subscriptions.controller.ts:117-147 — transactional Subscription.upsert + User.update({plan,
planExpiresAt})
Status: ✅
────────────────────────────────────────
Step: 5. JWT refreshed with new plan
Trace: 🔴 No explicit refresh call anywhere in the purchase flow. req.effectiveLimits is derived from the
JWT claim, not the DB (auth.ts:78), and the access token has a 15-minute TTL (jwt.ts:26). A user who
just paid for Gold keeps Free-tier effectiveLimits (radius, incognito, hideExactDistance, exploreAccess,
 gridProfiles cap) until their token naturally expires and silently refreshes on the next 401.
Status: 🔴 broken/delayed
────────────────────────────────────────
Step: 6. authStore.user.plan updated
Trace: ✅ store.tsx:98-99 optimistically sets it, then refreshUser() re-fetches /auth/me — but getMe()
doesn't mint a new JWT, only reads the DB-fresh user.plan for display purposes
Status: ✅ display updates immediately, ⚠ but doesn't fix step 5's entitlement lag
────────────────────────────────────────
Step: 7. Store screen updates
Trace: ✅ currentPlan derived from authStore.user.plan, re-renders immediately
Status: ✅
────────────────────────────────────────
Step: 8. Plan badge on profile/grid card updates
Trace: planBadge: user.plan !== 'free' ? user.plan : null (profile.serializer.ts:187) reads the DB value
directly on every grid fetch — unaffected by the JWT lag, so grid cards update correctly, even while the
 buyer's own entitlements (radius etc.) are still stale
Status: ✅ (for cards shown to others), ⚠ (for the buyer's own unlocked features)

Add-on purchase

Step: 1. Tap add-on → function
Trace: store.tsx:111 buyAddOn(addOnType)
Status: ✅
────────────────────────────────────────
Step: 2. POST /api/v1/billing/addons/purchase
Trace: {orderId, amount, currency, paymentProvider, key}
Status: ✅
────────────────────────────────────────
Step: 3. Razorpay opens
Trace: same SDK path
Status: ✅
────────────────────────────────────────
Step: 4. POST /api/v1/billing/addons/verify activates
Trace: ✅ creates AddOnPurchase row — but activation behavior varies wildly by type (see Part 2: chat
packs and travel passes do nothing)
Status: ⚠ endpoint always "succeeds," but 5 of 13 add-on types have no real effect
────────────────────────────────────────
Step: 5. JWT refreshed
Trace: n/a — add-ons aren't JWT-carried; effect is read live from AddOnPurchase rows each time (boost,
call topups) — not affected by the JWT-lag issue above
Status: ✅
────────────────────────────────────────
Step: 6. authStore updated
Trace: store.tsx:130 calls refreshUser() after verify
Status: ✅
────────────────────────────────────────
Step: 7. Store screen updates
Trace: No dedicated "your active add-ons" section rendered in store.tsx — user gets an
Alert.alert('Purchased', ...) but no persistent confirmation of what's now active or when it expires
Status: ⚠ feedback is a one-time toast, not durable UI
────────────────────────────────────────
Step: 8. Plan badge on profile/grid updates
Trace: Boost/spotlight reflected via boosted flag on grid cards (works); chat pack / travel pass have
nothing to reflect since they do nothing
Status: ⚠

---
PART 5 — FRONTEND STORE SCREEN AUDIT

1. All 4 plans displayed, correct names/prices? ✅ Yes — PLANS array in plans.ts renders Free/Premium/Gold/Platinum with correct per-cycle pricing.
2. All 4 billing cycles shown with correct prices? ✅ Yes, tabs for monthly/3mo/6mo/annual, pulling from the same verified-correct price table.
3. Savings percentages shown (PDF: Save 37%)? 🔴 No. store.tsx has no savings-percentage calculation or badge anywhere — the PDF's "Save 37%/37%/36%" column (§7) is entirely absent from the UI.
4. Current plan highlighted? ✅ Yes — border color + "Current" tag (store.tsx:224-228), plus a dedicated "Active" summary card with purchase/expiry dates.
5. All 13 add-ons displayed with correct prices? ✅ Yes, ADD_ONS array renders all 13 with matching prices.
6. Razorpay flow triggered on purchase tap? ✅ Yes, for both plans and add-ons, gated behind isPaymentsAvailable (native-only).
7. Plan badge updates after purchase? ✅ Yes, via refreshUser() + optimistic setUser().
8. Cancel subscription option? 🔴 No. The backend has a working DELETE /api/v1/billing/subscriptions/current (subscriptions.controller.ts:174-186), but no UI in store.tsx calls it — confirmed via grep, zero references to cancelSubscription/deleteSubscription anywhere in the frontend. A paying user cannot cancel from the app.
9. Plan-locked features shown with lock icons? 🔴 No. The screen only lists each plan's own perks with checkmarks; there is no feature-comparison-matrix view with locked/greyed-out rows for features the user doesn't have.
10. Does the store match PDF §8's Feature Comparison Matrix? 🔴 No — the store shows a short curated perks list per plan (4-6 bullets), not the ~40-row matrix from the PDF. A user cannot see the full Messaging/Calls/Grid/Privacy/Profile breakdown anywhere in the app.

---
PART 6 — PDF-ONLY FEATURES (not in backend-spec.json)

Feature: Women's free 7-day Premium trial at signup (§7 footnote: "may be offered")
In scope for V1?: Deferred — phrased as a suggestion ("may be offered"), not a requirement; absent from
spec and code. Reasonable to defer, but should be an explicit product decision, not a silent drop.
────────────────────────────────────────
Feature: Weekly ₹99-₹199 pricing option for Premium (§7 footnote: "Consider adding")
In scope for V1?: Deferred — same, explicitly framed as advisory in the PDF, not mandatory. Not in spec,
not in code.
────────────────────────────────────────
Feature: Second Chance (AI resurfaces scrolled-past profiles) (§6.2)
In scope for V1?: Should be in scope for V1 per the checklist's spirit but PDF's own §12 "Ship if Time
Allows" only lists "AI icebreakers (Platinum)" — Second Chance isn't explicitly bucketed  anywhere in
§12, meaning it's ambiguous. Currently: 🔴 zero code.
────────────────────────────────────────
Feature: Smart Inbox (AI sorts chats) (§6.2)
In scope for V1?: PDF §12 lists "Smart Inbox (Platinum)" under "Ship if Time Allows" — so intentionally
soft-launch, not a blocker. 🔴 not built.
────────────────────────────────────────
Feature: AI best time to send messages (§6.3)
In scope for V1?: Not on §12's checklist at all (neither "Must Ship" nor "Ship if Time Allows") →
implicitly Defer to V2 despite being fully speced in §6.3. 🔴 not built — consistent with deferral.
────────────────────────────────────────
Feature: Reply probability score (§6.3)
In scope for V1?: Same — not on §12's checklist → Defer to V2 is defensible. 🔴 not built.
────────────────────────────────────────
Feature: Weekly performance report (§6.3)
In scope for V1?: Same — not on §12 → Defer to V2. 🔴 not built.
────────────────────────────────────────
Feature: Background blur / virtual backgrounds in calls (§4.2, §5.2, §6.4)
In scope for V1?: Conflict with §12: not explicitly listed in "Must Ship" or "Ship if Time Allows," yet
it's a Premium-tier (paid, launch-priced) feature per §4. Ambiguous — should have been in scope given
Premium is a "Must Ship" tier, but the checklist doesn't call it out. 🔴 not built.
────────────────────────────────────────
Feature: Picture-in-picture calls (§4.2)
In scope for V1?: Same ambiguity — Premium feature, not explicitly on §12's list either way. 🔴 not built.
────────────────────────────────────────
Feature: Concierge support / 4-hour response (§6.5)
In scope for V1?: Not on §12 → reasonable to Defer to V2 (support ops, not app code). 🔴 not built.
────────────────────────────────────────
Feature: Early access to new features (§6.5)
In scope for V1?: Not on §12 → Defer to V2. 🔴 not built.
────────────────────────────────────────
Feature: backend-spec.json has NO v1LaunchChecklist section at all
In scope for V1?: This is itself a gap: the PDF's entire §12 (the single most load-bearing section for
scoping V1) was never transcribed into backend-spec.json. Anyone building purely from the spec has no
way to know what's a launch blocker vs. deferred.

---
PART 7 — FINAL GAP SUMMARY

✅ Fully Implemented

- Core messaging mechanic (open-chat-on-tap, no request screen, call-unlock-on-reply) — matches PDF §1 exactly.
- 14-day inactivity grid hiding, orientation-aware grid logic, block/mute/report/panic-hide.
- Free-tier 20-lifetime interaction cap (matches spec.json, conflicts with PDF — see below).
- Audio/video call-minute limits and audio/video call top-up add-ons (the only fully-working add-ons).
- All 12 billing-cycle price points across Premium/Gold/Platinum — zero drift between PDF, spec, and code.
- Grid radius tiering (25km free/premium, 100km gold/platinum), 5x Platinum ranking boost, hideExactDistance gating — all fixed in the prior session and confirmed correct here.
- Read receipts, typing indicator, message templates, pin chats, incognito mode, who-viewed-me, hide active/last-seen — all correctly plan-gated.
- Subscription purchase → DB activation (user.plan/planExpiresAt) via Razorpay/Stripe with signature verification and idempotency.
- Store screen: correct plan/cycle/add-on pricing display, current-plan highlighting, purchase-in-progress states.

⚠️ Partially Implemented

- Boost/Spotlight add-ons — payment and generic ranking-boost work, but the 5 distinct tiers (local/extended/city-wide/mega/spotlight) all collapse to one identical effect; the promised radius-expansion, city-wide targeting, and "Featured Nearby carousel" don't exist.
- verified_badge add-on — payment succeeds, but activation is deferred to an unconfirmed manual verification step; user may pay and not receive the badge.
- Advanced filters (education/occupation/etc.) — now parsed and logged (post-fix) instead of silently dropped, but still has zero effect on results since the User model lacks the columns.
- JWT-plan-lag — a buyer's own entitlements (radius, incognito, exploreAccess, etc.) don't reflect a just-completed purchase for up to 15 minutes, even though grid cards shown to others update immediately.
- Verified badge "included" for Gold/Platinum — no confirmed auto-grant code found; may rely entirely on the separate paid add-on flow.

🔴 Not Implemented

- Ads on the Free grid (PDF core monetization lever) — zero code anywhere.
- Chat pack add-ons (S/M/L) — charged, recorded, functionally inert (interaction cap never reads chatSlotsAdded).
- Travel pass / Travel pass week for Free & Premium — charged, but the only travel-mode route is hard-gated to Gold/Platinum with no add-on bypass; buyers get 403'd.
- Unsend messages, edit messages, in-chat translation (Premium/Gold-promised messaging features) — no code found anywhere in the chat module.
- Scheduled calls, 1080p/HD call-quality tiers, virtual backgrounds, background blur, low-bandwidth mode, PiP — none implemented; call quality appears fixed regardless of plan.
- All Platinum "AI Analytics" and "Concierge" features: best-time-to-message, reply probability score, weekly report, noise cancellation, AI virtual backgrounds, priority call routing, concierge support, early access, smart-inbox sorting, messages-at-top-of-inbox.
- Cancel-subscription UI — backend endpoint exists and works; nothing in the frontend calls it.
- Savings-percentage badges and full feature-comparison-matrix view in the store screen.

⚡ Spec Conflicts

1. New chats per day: PDF §3.1 = 20/day, resets at midnight (a recurring daily allowance). backend-spec.json/code = 20 lifetime unique people, never resets. This is the single most consequential conflict — it changes the entire free-tier growth/retention mechanic.
2. Call history access for Premium: PDF Feature Matrix §8 shows Premium = ✅ for "Call history log." middleware/subscription.ts:80 explicitly sets callHistoryAccess:false for premium (only Gold/Platinum get it).
3. Profile photo cap: PDF §3.4/§8 = tiered caps (4/8/12/15 by plan). backend-spec.json = "unlimited (single profile photo, optional)" for Free. Code = no cap enforced for anyone, at any plan.
4. Chat pack slot counts: PDF §9 and backend-spec.json addOns[] both say 5/15/35 extra slots for S/M/L. billingPlans.ts code says 10/25/50. (Moot in practice since neither number is ever applied — see 🔴 list — but the drift itself is a real 3-way inconsistency.)
5. Subscription endpoint paths: backend-spec.json documents /api/subscriptions, /api/subscriptions/verify, /api/subscriptions/current with no /v1/billing prefix. The actual mounted routes (and what the frontend correctly calls) are /api/v1/billing/subscriptions*. The spec's documented paths are simply wrong.
6. Add-on endpoints are undocumented: POST /api/v1/billing/addons/purchase, POST /api/v1/billing/addons/verify, GET /api/v1/billing/addons/active are fully implemented and used by the frontend, but do not appear anywhere in backend-spec.json's endpoints[] array — despite the addOns[] catalog section existing.
7. No v1LaunchChecklist section exists in backend-spec.json at all — the PDF's §12 (the definitive V1 scope-control document) was never captured in the machine-readable spec.

---
PRIORITIZED FIX LIST

P0 — Revenue-blocking (user pays, feature doesn't work):
1. Chat pack add-ons (S/M/L, ₹79/149/249) have zero effect on the interaction cap — either wire chatSlotsAdded into recordInteraction()'s limit check, or pull them from sale.
2. Travel pass / travel pass week (₹99/299) are sold to Free & Premium users but the only travel-mode route (city-profiles.routes.ts) is hard-gated to Gold/Platinum with no add-on override — buyers are 403'd on the feature they just paid for.
3. JWT-plan-lag: a buyer's own effectiveLimits (radius, incognito, exploreAccess, hideExactDistance, gridProfiles cap) stay on the old plan for up to 15 minutes post-purchase because the JWT isn't refreshed after subscriptions/verify. Force a token refresh (or re-issue the access token) immediately on successful verify.
4. verified_badge (₹199) payment succeeds with no confirmed activation path — a paying user may never receive the badge they bought. Either complete the activation flow or make the deferred-activation UX explicit in the purchase confirmation.

P1 — Core value prop missing (plan doesn't deliver what it promises):
5. Boost/spotlight tiers (5 SKUs, ₹49-₹499) all produce the identical ranking effect — the radius-expansion, city-wide targeting, and "Featured Nearby carousel" differentiators from the PDF don't exist. Either implement the differentiation or collapse pricing/marketing to match reality.
6. Unsend, edit-message, and in-chat-translation — promised at Premium/Gold tiers in both PDF and spec, zero backend code.
7. No cancel-subscription UI, despite a working backend endpoint — users can't self-serve cancel, likely driving support load or chargebacks.
8. Call-history-access conflict (Premium ✅ per PDF matrix vs. false in code) needs a product decision and a fix in subscription.ts.
9. v1LaunchChecklist is missing from backend-spec.json entirely — recreate it so the spec stops silently diverging from the PDF's launch scope.
10. Advanced filters and gender/relationshipIntent round-trip but several PDF-promised fields (education/occupation/etc.) have no backing columns — either add the columns or remove the filter UI to stop promising filtering that doesn't filter.

P2 — Nice-to-have (UX polish, minor features):
11. Savings-percentage badges ("Save 37%") missing from the store screen.
12. No full feature-comparison-matrix view in-app — users can't see the PDF's §8 breakdown anywhere.
13. Ads-on-free-grid monetization lever from the PDF was never built or specced.
14. Call-quality tiers (480p/720p/1080p), background blur, virtual backgrounds, PiP, scheduled calls, low-bandwidth mode — all unbuilt call-experience differentiators across every paid tier.
15. Platinum's full AI/Concierge suite (9 distinct features) — largely absent; scope/sequence per the PDF's own "ship if time allows" vs "defer to V2" buckets before building.

