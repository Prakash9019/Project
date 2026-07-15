# RFC: Community-Based Access Control Layer

- **Status:** proposed
- **Author:** Architect
- **Date:** 2026-07-15
- **Affected systems:** backend (auth, discovery/grid, right-now, rooms, chat, calls, safety, notifications, admin), Prisma schema, Redis, Socket.IO, frontend (thin, additive only)
- **Decision owner:** Architect + backend lead
- **Reversal cost:** > 1 sprint (schema + data backfill) → ADR-grade decision

> **Scope discipline:** This is an *additive access-control layer*, not a rebuild.
> The existing app — Browse, Right Now, Inbox, Groups, Profile, Matching,
> Notifications, navigation — keeps working exactly as today. The only behavioural
> change is that **every interaction is silently scoped to the caller's verified
> community.** No screen is redesigned. No module is rewritten.

---

## 1. Problem statement (solution-free)

Today every user can see and interact with every other eligible user within
geographic/filter range, worldwide. There is no notion of a bounded, verified,
mutually-trusted population.

We want interactions to be confined to a **verified community** the user provably
belongs to (Phase 1: their college/university, proven by an institutional email
domain), while every existing feature continues to behave identically *inside*
that boundary. Users in different communities must be mutually invisible and
mutually unreachable across **all** current and future interaction surfaces —
without per-feature special-casing that will inevitably be forgotten on the next
feature.

The core problem is therefore **not** "build a college app." It is:

> *How do we introduce a tenant boundary into a single-tenant social graph such
> that (a) isolation is enforced by default for every read and write, including
> features not yet written, (b) the boundary concept is generic across community
> types, and (c) the existing product surface is untouched?*

This is a **row-level multi-tenancy** problem where the tenant = the community.

---

## 2. Goals / Non-goals

### Goals
- Generic, reusable **Community** concept (college is just `type = "college"`).
- **Default-deny isolation**: a query that forgets to scope should fail closed or
  be caught by a test, not leak cross-community data.
- Zero UI redesign; all module behaviour preserved *within* a community.
- Membership derived from **verified institutional email domain** (Phase 1).
- Support thousands of communities, millions of users, no material latency hit on
  the discovery hot path.
- Admin surface to manage communities and domain approvals.
- Every **future** module inherits isolation automatically (via a shared scoping
  primitive), not by remembering to add a filter.

### Non-goals (Phase 1 — explicitly deferred, with owners)
- **Multiple communities per user simultaneously.** The schema supports it; the
  runtime enforces exactly one *active* community. (Owner: Architect, revisit Phase 3.)
- **Self-serve community creation** by end users. Communities are provisioned by
  admins / domain-approval flow only.
- **Cross-community "public" surfaces** (e.g. global rooms). Deferred.
- **Auto-provisioning a community from an unknown domain.** Unknown domains go to
  a waitlist; they do not silently create a live community.
- **Frontend redesign.** Only additive states: a "verify your institution" gate
  on onboarding and a (single, dumb) empty-state string when a community is small.
- **Backfilling existing global users into communities.** Existing production
  users get `communityId = null` and are handled by an explicit legacy policy
  (§11), not silently swept into a community.

---

## 3. Scope options (4-mode framework)

| Mode | What it means here | Verdict |
|---|---|---|
| **Expand** | Ship full multi-community-per-user, community roles/admins, cross-community discovery toggles, org hierarchies (campuses under a university) now. | **Reject for Phase 1.** Real value, but multiplies enforcement complexity (union-of-communities in every `where`) before we've validated the core isolation model. Schema is designed to *allow* it later. |
| **Selective (recommended)** | Generic `Community` + `CommunityDomain` + `CommunityMembership` tables, **single active community per user**, communityId denormalised onto `User` + JWT, one shared scoping primitive applied to all interaction surfaces, admin domain approval. | **Recommended.** Smallest change that proves isolation end-to-end and is generic. |
| **Hold** | Defer entirely. | Reject — this is the strategic pivot; it gates everything downstream. |
| **Reduce** | Hardcode a `College` table + `collegeId` on User, filter only Browse/Right Now/Rooms. | Reject — non-generic (violates the explicit long-term requirement), and per-feature filtering guarantees a future leak. |

**Recommendation: Selective.** Generic data model, single-community enforcement,
one enforcement primitive. Details below.

---

## 4. High-level architecture

```
                         ┌─────────────────────────────────────────────┐
                         │                 Client (unchanged UI)        │
                         │  + institution-verify gate on onboarding     │
                         └───────────────┬─────────────────────────────┘
                                         │ Bearer JWT (now carries communityId)
                                         ▼
        ┌────────────────────────────────────────────────────────────────────┐
        │ requireAuth ──► req.user = AccessClaims{ sub, …, communityId }       │
        │      │                                                              │
        │      ▼                                                              │
        │ withCommunity  (new)  ──► req.communityId (asserts non-null,        │
        │                            or 403 community_required)               │
        └───────────────┬────────────────────────────────────────────────────┘
                        │
   ┌────────────────────┼─────────────────────────────────────────────────┐
   │                    ▼                                                   │
   │   Service layer calls  scoped(req)  →  { communityId }                 │
   │   spread into EVERY Prisma `where` on a community-scoped model.        │
   │                                                                        │
   │   Defense-in-depth: Prisma Client Extension asserts communityId is     │
   │   present on scoped-model reads (throws in dev/test, logs in prod).    │
   └────────────────────┬───────────────────────────────────────────────────┘
                        ▼
        ┌───────────────────────────┐     ┌──────────────────────────────┐
        │ PostgreSQL                │     │ Redis                        │
        │  users.community_id (idx) │     │  geo index (community-keyed) │
        │  communities              │     │  presence, banned, community │
        │  community_domains        │     │  membership cache            │
        │  community_memberships    │     └──────────────────────────────┘
        └───────────────────────────┘
                        │
                        ▼
        ┌───────────────────────────────────────────────┐
        │ Socket.IO — join communityRoom(communityId)   │
        │  broadcasts (right-now, presence) scoped by    │
        │  community room; 1:1 & group already gated at  │
        │  creation, so no cross-community delivery path. │
        └───────────────────────────────────────────────┘
```

**The one idea to take away:** the tenant boundary is a **single indexed column
(`users.community_id`)** that is (a) denormalised for O(1) filtering, (b) carried
in the JWT so no extra DB hit, and (c) injected into every query by **one shared
helper**, with a Prisma extension as a backstop. Everything else is plumbing.

---

## 5. Data model

### 5.1 New entities

```prisma
enum CommunityType {
  college
  university
  company
  organization
  alumni_network
  club
  startup_community
  professional_network
  private_community
}

enum CommunityStatus {
  active
  pending      // provisioned, not yet open to joins
  suspended
  archived     // soft-deleted; members frozen, no new joins
}

enum DomainStatus {
  approved
  pending      // submitted, awaiting admin approval
  rejected
}

enum MembershipStatus {
  active
  pending      // e.g. manual-approval communities (future)
  removed
}

/// A tenant boundary. College is just type=college.
model Community {
  id            String          @id @default(uuid())
  type          CommunityType
  name          String          @db.VarChar(160)   // "ABC College"
  slug          String          @unique             // "abc-college"
  status        CommunityStatus @default(pending)
  logoUrl       String?
  description   String?         @db.VarChar(500)
  country       String?
  region        String?         // state / city — for campus grouping later
  parentId      String?         // multi-campus: campus -> parent university (nullable, future)
  memberCount   Int             @default(0)         // denormalised counter
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  parent        Community?           @relation("CommunityHierarchy", fields: [parentId], references: [id])
  children      Community[]          @relation("CommunityHierarchy")
  domains       CommunityDomain[]
  memberships   CommunityMembership[]
  members       User[]                                // via User.communityId (denormalised active)

  @@index([type, status])
  @@index([parentId])
  @@map("communities")
}

/// Verified email domains that map INTO a community. Many domains -> one community.
model CommunityDomain {
  id           String       @id @default(uuid())
  communityId  String
  domain       String       @unique     // "abc.edu" — lowercased, no leading @, apex or sub
  status       DomainStatus @default(pending)
  isPrimary    Boolean      @default(false)
  note         String?                   // admin note / evidence link
  approvedBy   String?                   // admin user id
  approvedAt   DateTime?
  createdAt    DateTime     @default(now())

  community    Community    @relation(fields: [communityId], references: [id], onDelete: Cascade)

  @@index([communityId, status])
  @@map("community_domains")
}

/// Source of truth for membership. Supports future multi-community; Phase 1
/// enforces at most one status=active row per user at the app layer.
model CommunityMembership {
  id           String           @id @default(uuid())
  userId       String
  communityId  String
  status       MembershipStatus @default(active)
  verifiedVia  String                       // "email_domain" | "invite" | "admin" | "manual_review"
  verifiedEmail String?                      // the institutional email proven at join time
  joinedAt     DateTime         @default(now())
  removedAt    DateTime?

  user         User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  community    Community        @relation(fields: [communityId], references: [id], onDelete: Cascade)

  @@unique([userId, communityId])
  @@index([communityId, status])
  @@index([userId, status])
  @@map("community_memberships")
}
```

### 5.2 Changes to existing `User`

```prisma
model User {
  // ... all existing fields unchanged ...

  // ── Community layer ──
  communityId       String?    // denormalised ACTIVE community (the hot-path filter)
  communityJoinedAt DateTime?
  // (existing `isCollegeVerified` boolean is generalised → kept as a UI hint,
  //  now meaning "has an active community membership"; may be dropped later)

  community    Community?            @relation(fields: [communityId], references: [id])
  memberships  CommunityMembership[]

  // Composite indexes so community scoping is free on the hot paths:
  @@index([communityId, lastActiveAt])
  @@index([communityId, isOnGrid, lastActiveAt])
  @@index([communityId, rightNowExpiresAt])
}
```

**Why denormalise `communityId` onto `User` when `CommunityMembership` is the
source of truth?** Because every discovery query *already* filters `User`. Adding
`communityId = $X` to an existing indexed `where` is a single predicate on a
composite index — effectively free. Resolving membership through a join on every
grid page would add a join to the single busiest query in the system. The
membership table stays authoritative for history/audit and future multi-community;
`User.communityId` is the read-optimised projection of "the one active membership."
A DB constraint / write-path invariant keeps them consistent (§8.3).

### 5.3 Rooms (Groups) — add tenant column

`Room` gets a nullable `communityId` (+ `@@index([communityId, isActive])`).
Existing global/official rooms keep `communityId = null` and are governed by the
legacy policy (§11). New rooms inherit the creator's community.

### 5.4 Entity-relationship diagram

```
Community 1───* CommunityDomain          (abc.edu, abc.ac.in  →  ABC College)
Community 1───* CommunityMembership *───1 User        (audit/history, multi-community-ready)
Community 1───* User            (User.communityId — denormalised ACTIVE membership)
Community 0/1─* Room            (Room.communityId — group tenancy)
Community 1───* Community        (self, parentId — campus → university, future)

User ──< Conversation >── User   (both endpoints must share communityId — gated at create)
User ──< Tap / ProfileView / Favorite / Call >── User   (same-community gate at write)
```

---

## 6. Authentication & verification

### 6.1 Institutional-email verification flow

Reuse the **existing Email OTP** path (`/auth/email/send-otp` →
`/auth/email/verify-otp`, Resend-backed) — do not build a new verifier. The only
addition is a **domain-resolution step** after the OTP is proven.

```
1. User enters institutional email (john@abc.edu) on onboarding.
2. Existing email-OTP send → verify. Email ownership proven → emailVerified = true.
3. NEW: extract domain = lowercase(part after last '@')  → "abc.edu"
4. NEW: look up CommunityDomain where domain = "abc.edu" AND status = approved.
        └─ found     → resolve communityId.
        └─ not found → do NOT block sign-in; create user with communityId = null,
                        return { needsCommunity: true, domain }, enqueue a
                        DomainRequest for admin review (waitlist). Client shows a
                        "we're adding your institution" state. No cross-community
                        access is granted meanwhile (default-deny, §7).
5. NEW: upsert CommunityMembership(userId, communityId, status=active,
        verifiedVia="email_domain", verifiedEmail=email).
        Set User.communityId + communityJoinedAt (single active-community invariant).
6. Mint JWT — AccessClaims now includes communityId (§6.4).
```

```
   john@abc.edu ──OTP verified──► domain "abc.edu"
        │
        ▼
   CommunityDomain lookup ──► Community "ABC College" (communityId)
        │
        ▼
   CommunityMembership(active) + User.communityId set ──► JWT { communityId }
```

### 6.2 Domain verification & new-domain approval

- **Domain ownership is an admin-trust decision, not a client claim.** A user
  proving `john@abc.edu` proves they own *that mailbox*, not that `abc.edu` maps
  to ABC College. The domain→community mapping is curated:
  - Seed known domains at community creation (admin).
  - Unknown domain from a real verified email → auto-create a `CommunityDomain`
    with `status = pending` + a `DomainRequest` for an admin to approve/reject/merge.
  - Approval is idempotent and audited (`approvedBy`, `approvedAt`).
- **Anti-abuse:** never auto-approve a domain just because someone verified an
  email at it (someone could own `attacker@harvard.edu`-looking-but-not domains,
  or a domain could be a public mail provider). Public/free providers
  (`gmail.com`, `outlook.com`, …) are on a permanent **denylist** — they can never
  map to a community.

### 6.3 Multiple official domains / multi-campus

- **Multiple domains, one institution:** natural — many `CommunityDomain` rows
  → one `communityId` (`abc.edu`, `abc.ac.in`, `mail.abc.edu` all → ABC College).
- **Multi-campus under one org:** `Community.parentId`. Phase 1 treats each campus
  as its own isolated community; a future "see my whole university" toggle can
  union `parentId` children. Schema is ready; enforcement deferred (non-goal).

### 6.4 JWT / claims change

`AccessClaims` gains `communityId: string | null`. Populated by `issueTokenPair`.
Because tokens are short-lived (15m) and refreshed, community changes propagate
within one refresh cycle. **Critical caveat:** a stale token could carry an old
`communityId` for up to 15m after a membership change → §8.4 mitigations
(refresh-token family rotation on community change + optional Redis membership
version check on sensitive writes).

### 6.5 Email change

- Changing email re-runs verification. If the **new** domain maps to a *different*
  community: this is a **community migration** (§10) — it is a deliberate,
  audited, admin-reviewable event, **not** an implicit silent move. Default policy:
  block automatic cross-community migration on email change; require re-verify +
  explicit confirmation, and rotate refresh tokens so the old community's tokens die.
- Changing to an email in the **same** community, or a non-institutional email as
  a *secondary* contact: no membership change.

---

## 7. Authorization strategy (the core)

**Principle: default-deny, single enforcement primitive, three defensive layers.**

### Layer 1 — Context (middleware)
A new `withCommunity` middleware runs after `requireAuth`:

```ts
// pseudo
function withCommunity(req, res, next) {
  const cid = req.user?.communityId;
  if (!cid) return next(Errors.forbidden('community_required'));  // default-deny
  req.communityId = cid;
  next();
}
```

Mount it on every community-scoped router (grid, discovery, rooms, conversations,
calls, safety-writes, future modules). A user with `communityId = null` (waitlisted
or legacy) gets a clean `403 community_required` — never a partial/global result.

### Layer 2 — Enforcement (shared query helper) — **primary**
Middleware cannot rewrite Prisma `where` clauses, so enforcement lives at the
service/repository layer via one helper that is spread into every scoped query:

```ts
export const scoped = (req) => ({ communityId: req.communityId });

// grid.service — the ONE line added to the existing where:
const users = await prisma.user.findMany({
  where: { ...scoped(req), id: { in: candidateIds }, /* …all existing predicates unchanged… */ },
});
```

For **writes** (create conversation, tap, view, call, join room), assert both
endpoints share the caller's community *before* the write:

```ts
async function assertSameCommunity(actorCid, targetUserId) {
  const t = await prisma.user.findUnique({ where: { id: targetUserId }, select: { communityId: true } });
  if (!t || t.communityId !== actorCid) throw Errors.forbidden('cross_community_forbidden');
}
```

### Layer 3 — Backstop (Prisma Client Extension) — **defense-in-depth**
A `$allModels` query extension that, for the registered set of community-scoped
models, **asserts `communityId` is present in the `where`** on read and **throws
in dev/test / logs+alerts in prod** if it is missing. This converts "someone wrote
a new query and forgot to scope it" from a silent data leak into a loud failure —
directly serving the "future features inherit isolation automatically" requirement.

> **Trade-off (documented):** A *fully automatic* extension that silently injects
> `communityId` is rejected as "magic" — it hides the security boundary and makes
> intentional cross-community admin queries awkward. We choose **assert, don't
> inject**: the helper makes scoping a one-liner, the extension makes *forgetting*
> it fail loudly. Explicit at the call site, enforced by CI.

### Layer 4 — Fitness function (CI)
An **isolation integration test** seeds two communities (A, B) and asserts, for
*every* interaction surface, that a user in A can never read or write a user/room/
message in B. This test is the executable contract; adding a new module without a
corresponding isolation assertion fails review. (Architecture standard:
"fitness functions over big-bang designs.")

### Per-surface enforcement summary

| Surface | File (today) | Enforcement |
|---|---|---|
| Browse grid | `grid.service.ts:218` | `...scoped(req)` in `where`; geo candidates re-filtered by community |
| Right Now | `discovery.controller.ts:180` | `...scoped(req)` in `where` |
| Views / Taps | `discovery.controller.ts` | `...scoped(req)` in `where`; taps also `assertSameCommunity` on write |
| Rooms discover/join/create | `rooms.service.ts:131` | `Room.communityId` in `where`; create inherits creator community; join asserts |
| Conversations / Chat | chat module (create path) | `assertSameCommunity` at conversation create → all messages structurally intra-community |
| Calls | calls module | call invite asserts same community (conversation already gated) |
| Notifications | notification producers | derive audience from already-scoped rows → inherit isolation |
| Presence / Right-Now realtime | `realtime/socket.ts` | broadcast to `communityRoom(cid)` instead of global |
| Matching | matching query | same `scoped(req)` predicate |
| **Any future module** | — | Layer 2 helper + Layer 3 assertion + Layer 4 test |

---

## 8. Backend changes (concrete)

### 8.1 Database
- New tables: `communities`, `community_domains`, `community_memberships`.
- `users`: add `community_id` (nullable FK), `community_joined_at`; 3 composite
  indexes (§5.2).
- `rooms`: add `community_id` (nullable FK) + index.
- New migration `20260715_community_layer` (follows the dated-prefix convention;
  respect the shared-Supabase `migrate deploy` workaround noted in project memory).
- Public/free email-provider **denylist** seed.

### 8.2 API changes (all additive → `/api/v1`, no version bump)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth/email/verify-otp` | *extended* response: `{ …, communityId, needsCommunity, domain }` |
| `GET` | `/communities/me` | caller's community summary (name, logo, memberCount) |
| `POST` | `/communities/join` | resolve domain → join (idempotent); used post-verify |
| `GET` | `/admin/communities` | list/manage (admin) |
| `POST` | `/admin/communities` | create community (admin) |
| `POST` | `/admin/communities/:id/domains` | add/approve domain (admin) |
| `GET` | `/admin/domain-requests` | pending unknown-domain waitlist (admin) |
| `POST` | `/admin/domain-requests/:id/approve` \| `/reject` | resolve waitlist (admin) |

Existing discovery/grid/rooms/chat endpoints are **unchanged in shape** — they
just return community-scoped data. Error envelope follows the org standard
(`code: "community_required" | "cross_community_forbidden"`, 403).

### 8.3 Middleware / write-path invariant
- New `withCommunity` (Layer 1) mounted on scoped routers.
- New `scoped()` helper + `assertSameCommunity()` (Layer 2).
- New Prisma extension registering the scoped-model set (Layer 3).
- **Single-active-community invariant:** the join service is the *only* writer of
  `User.communityId`; it upserts the membership and sets the denormalised column in
  one transaction. A partial unique index (`community_memberships` where
  `status='active'`) enforces ≤1 active membership per user at the DB level.

### 8.4 Auth changes
- `AccessClaims += communityId`; `issueTokenPair` populates it.
- On community change (join/migrate/removal): **rotate the refresh-token family**
  (mechanism already exists — `RefreshToken.family`) so stale-community access
  tokens can't be refreshed. Access tokens still valid ≤15m → for
  security-sensitive writes, optionally verify `communityId` against a Redis
  membership-version key (`community:ver:{userId}`) bumped on change.

### 8.5 Query-filtering strategy
- Reads: spread `scoped(req)` into the existing `where` (one predicate, hits the
  new composite indexes). No query is restructured.
- The Redis geo candidate list is global; the DB `where` already narrows it, so
  the community predicate rides the existing narrowing step. At very large scale,
  optionally **key the geo index per community** (`geo:{communityId}`) so the
  candidate set is pre-scoped (§9).
- Writes: `assertSameCommunity` before any cross-user row insert.

### 8.6 Caching implications
- **JWT is the cache** for `communityId` — no per-request membership lookup.
- Add `community:ver:{userId}` (Redis) only for sensitive-write revalidation.
- Presence/geo/right-now Redis keys optionally gain a `{communityId}` segment to
  pre-partition hot sets.
- `Community.memberCount` is a denormalised counter (incr/decr on join/leave),
  not a `COUNT(*)` per page load.

---

## 9. Scalability

- **Filtering cost:** community scoping = one extra equality predicate on a
  composite index that leads with `community_id`. Postgres uses the index for
  `WHERE community_id = $1 AND is_on_grid AND last_active_at >= $2` directly →
  the working set per query *shrinks* (you scan one community, not the world).
  Net effect at scale is **faster** discovery, not slower.
- **Thousands of communities × millions of users:** `community_id` is high-
  cardinality and leads every hot index → excellent selectivity. No partitioning
  needed initially; if a single community becomes enormous, Postgres declarative
  **partitioning by `community_id`** (or hash) is a later, transparent option.
- **Geo index:** per-community geo keys (`geo:{communityId}`) bound each geosearch
  to one community's members — smaller sets, faster radius queries, natural
  sharding key.
- **Socket fan-out:** `communityRoom(cid)` bounds broadcast blast radius to one
  community instead of global — strictly less work than today.
- **Counters over aggregates:** member counts, online counts are denormalised.

**What breaks first?** The stale-JWT window (15m) under rapid membership change,
and any query a future engineer forgets to scope. Both are mitigated by design
(token rotation + Layer 3 assertion + Layer 4 test), not by scale.

---

## 10. Security analysis

| Concern | Strategy |
|---|---|
| **Access control** | Default-deny (`community_required`), single scoping primitive, 3 enforcement layers + CI fitness test. |
| **Domain-spoof / rogue mapping** | Domains are admin-curated, never auto-trusted from a client. Public-provider denylist. Verifying an email proves mailbox ownership only, not org identity. |
| **Enumeration across communities** | Profile-by-id, conversation-by-id, room-by-id all pass `assertSameCommunity` / scoped `where` → cross-community IDs return `404` (indistinguishable from "doesn't exist"), never `403`-with-existence-leak. |
| **Stale token privilege** | Short-lived (15m) tokens + refresh-family rotation on community change + optional Redis membership-version check on sensitive writes. |
| **Waitlisted / null-community user** | Sees nothing (default-deny). Cannot read or write any community surface. |
| **Insider leak via new code** | Layer 3 assertion throws in dev/test, logs+alerts in prod; Layer 4 test blocks merge. "No silent failures" (ethos) — a missing scope is loud. |
| **Privacy** | Persistent location already never exposed; community membership adds a data-classification obligation (institutional email = PII) → store `verifiedEmail` under the existing PII-encryption path (`encrypt.ts`, currently unwired — flag as dependency). |
| **Admin abuse** | Community/domain mutations are audited (`approvedBy`, timestamps) and admin-only. |

**Attack vectors explicitly considered:** owning a mailbox at an unmapped domain
(→ waitlist, no access); registering a look-alike domain (→ admin approval gate);
replaying an old JWT after being removed (→ family rotation + version check);
guessing sequential IDs across communities (→ 404 via scoped reads); a partner
adding a cross-community user to a group (→ join asserts same community).

---

## 11. Edge cases & handling

| Case | Handling |
|---|---|
| Multiple official domains | Many `CommunityDomain` → one `communityId`. Native. |
| Institution changes its domain | Add new `CommunityDomain` (approved), keep old as `approved` or mark for sunset; existing members unaffected (membership is by community, not domain). |
| User with a personal (non-institutional) email | Domain unmapped → `communityId = null`, waitlisted, default-denied until they verify an institutional email. |
| Guest users (future) | `communityId = null` by definition → default-deny gives them a coherent "no community" experience with zero new code. |
| Community migration (transfer) | Explicit, audited admin/self-serve-with-reverify flow: close old membership (`removed`), open new (`active`), reset `User.communityId`, rotate refresh tokens, bump membership version. Never implicit. |
| Community deletion | Soft-delete → `status = archived`. Members frozen (default-deny on reads), no new joins, data retained for audit/restore. Hard delete is a separate, deliberate, cascade-aware admin op. |
| Multi-campus under one org | `parentId` hierarchy; Phase 1 each campus isolated; union view is a future toggle. |
| Multiple communities per user | Schema (`CommunityMembership`) ready; runtime enforces one active. When enabled, `scoped()` becomes `communityId IN (…active ids)` — the single choke point changes in one place. |
| Existing global (pre-community) users | `communityId = null`; governed by explicit legacy policy — either (a) grandfathered into a special "legacy/global" community, or (b) prompted to verify. **Decision required (open question Q3).** Not silently swept anywhere. |
| Two communities share a domain (shouldn't) | `CommunityDomain.domain` is `@unique` → structurally impossible; the second mapping attempt fails and routes to admin. |

---

## 12. Recommended implementation phases

Ordered by dependency; sizing S (<1d) / M (1–3d) / L (>3d).

1. **(M) Schema + migration** — `Community`, `CommunityDomain`,
   `CommunityMembership`; `User.communityId` + indexes; `Room.communityId`;
   provider denylist seed. *(no behaviour change yet)*
2. **(S) JWT + auth claims** — `AccessClaims.communityId`, `issueTokenPair`,
   refresh-family rotation on community change.
3. **(M) Verification wiring** — domain extraction + resolution in
   `verify-otp`; join service; single-active-community invariant + waitlist/
   `DomainRequest` enqueue.
4. **(S) Enforcement primitives** — `withCommunity` middleware, `scoped()`,
   `assertSameCommunity()`.
5. **(M) Apply scoping to existing surfaces** — grid, right-now, views/taps,
   rooms, conversations/chat create, calls, matching. One-line `where` edits +
   write asserts.
6. **(M) Prisma extension backstop (Layer 3)** + **isolation fitness test
   (Layer 4, L→decompose)** across every surface.
7. **(S) Socket scoping** — `communityRoom(cid)` for presence/right-now broadcasts.
8. **(M) Admin surface** — community CRUD, domain approval, domain-request waitlist.
9. **(S) Frontend additive states** — institution-verify gate, waitlist screen,
   small-community empty state. *(no redesign)*
10. **(S) PII: wire `encrypt.ts`** for `verifiedEmail` (closes a known deferred item).

Phases 1–5 deliver working isolation; 6 makes it durable for future modules;
7–10 complete the product surface.

---

## 13. Hidden assumptions (must be true)

1. Every discovery/interaction query today funnels through the Prisma `where`
   surfaces enumerated in §7 — no raw SQL bypass exists. *(Verified for grid /
   discovery / rooms; chat + calls create-paths need confirmation — Q1.)*
2. Email-OTP is a reliable ownership proof for institutional mail (deliverability
   to `.edu`/`.ac.in` via Resend). *(Verify — Q2.)*
3. Existing global production users can be assigned a legacy policy without
   product breakage. *(Decision — Q3.)*
4. The 15-minute access-token window is an acceptable staleness bound for
   membership changes given rotation + version-check mitigations.
5. Redis geo/presence keys can gain a community segment without breaking existing
   consumers (they're internal to discovery). *(Verify.)*

---

## 14. Risk register (top 3)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | A future (or existing) query forgets community scoping → **cross-community data leak**. | Med | **Critical** | Layer 3 Prisma-extension assertion (loud fail) + Layer 4 CI isolation test as a merge gate + `scoped()` one-liner ergonomics. |
| R2 | **Stale JWT** grants access to a just-left community for ≤15m. | Med | Med | Refresh-family rotation on community change + Redis membership-version check on sensitive writes + short token TTL. |
| R3 | **Bad domain→community mapping** (spoof, look-alike, public provider) admits wrong users. | Med | High | Admin-curated approvals (never client-trusted), public-provider denylist, `domain @unique`, audited approvals, waitlist for unknowns. |

Secondary: scope-creep into a rebuild (mitigated by the §2 non-goals and "additive
only" discipline); migration on shared Supabase DB (use the documented
`migrate deploy` workaround).

---

## 15. Open questions (owner / needed-by)

- **Q1 — Chat & calls create-paths:** confirm the exact service functions that
  create a `Conversation` / initiate a `Call`, to place `assertSameCommunity`.
  *(Owner: backend lead — before Phase 5.)*
- **Q2 — Institutional deliverability:** does Resend reliably deliver OTP to
  `.edu` / `.ac.in` and equivalents? Fallback if not? *(Owner: Architect — before Phase 3.)*
- **Q3 — Legacy user policy:** grandfather existing global users into a "legacy"
  community, force re-verify, or run community + legacy-global side by side?
  *(Owner: product + Architect — before Phase 1 migration.)*
- **Q4 — Multi-community timing:** is single-active-community acceptable for the
  foreseeable roadmap, or is dual-membership (e.g. college + company) needed
  sooner than Phase 3? *(Owner: product.)*
- **Q5 — Right Now / rooms with `communityId = null`** (existing official/global
  rooms): keep as cross-community public, or migrate each to a community? *(Owner: product.)*

---

## 16. Alternatives considered

1. **Hardcoded `College` table + `collegeId`.** Rejected — violates the explicit
   generic/reusable requirement; per-feature filtering guarantees a future leak.
2. **Per-request membership lookup (no denormalised `communityId`, no JWT claim).**
   Rejected — adds a join/DB hit to the busiest query; the JWT already travels with
   every request and is the natural carrier.
3. **Fully-automatic Prisma middleware that silently injects `communityId`.**
   Rejected as primary — hides the security boundary ("magic"), complicates
   legitimate admin cross-community queries, and makes the boundary invisible at
   the call site. Kept only as an *assert-don't-inject* backstop.
4. **Separate database/schema per community (hard multi-tenancy).** Rejected —
   massive operational cost, breaks the single social-graph model, no realistic
   need at this stage; row-level tenancy on one indexed column is sufficient and
   reversible.
5. **Community boundary enforced only in the frontend.** Rejected outright — trivially
   bypassable; isolation must be server-side and default-deny.

---

## 17. Self-grade (against evaluators/architecture.md + plan-feature checklist)

- [x] Problem stated independently of the solution (§1 — framed as row-level tenancy).
- [x] All four scope modes evaluated (§3).
- [x] Success metric proposed (see below).
- [x] Component interactions + failure modes described (§4, §9 "what breaks first").
- [x] Hidden assumptions listed explicitly (§13).
- [x] Top 3 risks with mitigation (§14).
- [x] Phased task list ordered by dependency with S/M/L sizing (§12).
- [x] API contract sketch (§8.2), data model sketch (§5), ERD (§5.4).
- [x] Alternatives considered (§16).
- [x] Open questions with owners (§15).
- [x] Reversibility considered (denormalised column + additive tables + soft-delete).
- [x] Consistency with org defaults (REST + `/v1` additive, JWT, Postgres, Redis) — no divergence requiring a separate ADR beyond this RFC.

**Proposed success metrics:** (1) **0** cross-community reads/writes observable in
the isolation test suite and in production audit logs; (2) discovery p95 latency
**unchanged or lower** after scoping (validate with a spike); (3) ≥ X% of new
sign-ups resolve to a mapped community on first attempt (domain-coverage KPI);
(4) waitlist→approved domain turnaround under target SLA.

---

## 18. Standards compliance notes

- **API design:** all new endpoints are `/api/v1` additive, plural nouns, standard
  error envelope with stable `code`s (`community_required`, `cross_community_forbidden`),
  correct status codes (403 for cross-community, 404 for invisible resources). No
  breaking change → no major version bump.
- **Architecture:** this RFC *is* the required ADR-grade record (new tables +
  auth-contract change + hard-to-reverse). No shared-DB-across-services violation
  (single service). No synchronous chain added.
- **Ethos:** scope is completed or explicitly descoped with owners (§2 non-goals);
  existing solutions reused (email-OTP, refresh-family rotation, geo/presence
  infra) before building; no silent failures (Layer 3 loud-fail + Layer 4 gate);
  no commits/deploys performed — this is design only.
```
