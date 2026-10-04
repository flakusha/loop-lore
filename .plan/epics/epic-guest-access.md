<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Guest Access — Unauthenticated Public Browsing (draft for new worktree)

**Effort:** Large
**Type:** epic
**Overview:** (see sections below)


**Status:** Not Started
**Priority:** High — public reach / demo-ability gap
**Tags:** auth, access, guest, public, visibility, read-only

## Why

Today every non-static route funnels through `requireUserId`
(`src/routes/http-utils/errors.ts:101-104`) — no token + `auth.required=true`
means 401, and no token + `auth.required=false` means the **solo** user
(`["*"]` perms, `src/users/permissions.ts:78`). There is no middle tier: a
visitor without an account cannot see anything beyond static files and asset
signed URLs. Meanwhile the building blocks for one already exist and are
half-wired:

- `UserRole` includes `guest` and `DEFAULT_PERMISSIONS.guest =
  ["chat.join", "character.view", "world.view"]` (`src/users/permissions.ts:79`)
  — but nothing ever produces a guest context.
- `chats.visibility` (private/public/unlisted) exists but **no access check
  reads it** (`src/chat/service/access.ts:115-160` grants admin/creator/
  participant only).
- Assets enforce visibility fully, yet `canAccessAsset`
  (`src/assets/service/read.ts:223-246`) requires a non-null `actorId` for
  public assets — anonymous fails by construction.
- Worlds already allow non-members to join `WorldVisibility.Public` worlds
  (`src/routes/chat-search/join.ts:53-55`) — the only public-content seam today.

This epic adds the missing tier: an opt-in, read-mostly **guest** context for
unauthenticated visitors, plus the visibility enforcement that makes "public"
mean something for chats and assets.

## Approach Review (2026-10-04)

### The "public" ambiguity — two tiers, not one

"Public" is overloaded in this codebase. The design must keep the tiers apart:

| Tier | Meaning | Today |
| --- | --- | --- |
| **Registered-public** | Discoverable/joinable by any **authenticated** user | `chats.public` flag (migration 038/039) exists but is unenforced; public assets visible to any `actorId`; public worlds joinable |
| **Open-public** | Reachable with **no account at all** — the guest tier | Only asset signed URLs (`src/assets/signed-url.ts`) and static files |

Guest access is the open-public tier. Registered-public enforcement (any
logged-in user can see public content) ships in the same tickets because both
branches live in the same access checks — but the tiers have different threat
models and MUST NOT be conflated: registered-public inherits the RBAC matrix;
open-public is a synthetic, ephemeral, write-free context.

### Design decision — synthetic guest context, not a DB user

Options considered:

- **A. Real `guest` user row** (like the seeded demo guest from
  `TASK-user-seeding-role-expansion`): every visitor shares one identity → no
  per-visitor sessions, conflated audit trail, muddy CSRF/session semantics.
  Rejected for open access. (Fine for demos; wrong for public browsing.)
- **B. Synthetic guest context** (chosen): when no token is presented and a
  new `auth.guestAccess` config flag is on, the auth derive sets
  `userId=null, userRole=UserRole.Guest, sessionId=null` instead of the solo
  fallback. Read-mostly routes gate on `can(role, perm)` — the guest row of
  the permission matrix already exists. No `users` row, no sessions row, no
  persistence; the context is re-derived per request.

**Decision: B**, opt-in via `auth.guestAccess` (default `false`). Solo mode
is untouched: the derive distinguishes "no token + guestAccess" from
"no token + solo" explicitly — a guest must never fall through to solo's
`["*"]` perms.

### What guests can do

- Browse `WorldVisibility.Public` worlds — read-only.
- View chats with `visibility=public` — read-only; no join, no participation,
  no messages.
- View assets with `visibility=public` via the existing signed-URL path.
- Use read-only public functionality: public story feed (proposed
  `epic-public-feed`), public templates (`TASK-public-templates-routes`,
  done), docs.

### What guests cannot do

Anything behind `requireUserId`: all mutations, chat creation, messaging,
reactions, exports, settings, admin. Registration/login remains the upgrade
path (`epic-frontend-login.md`). The NSFW gate keeps denying anonymous
outright until a guest-tier policy exists.

### Security considerations

- **No solo fallthrough**: the derive's guest branch is mutually exclusive
  with the solo fallback; a unit test pins this.
- **Read-only by construction**: guest perms contain no write capability;
  every mutation route keeps `requireUserId`.
- **Rate limiting**: guest reads need per-IP limits; today rate limiting is
  per-route on auth routes only (`src/routes/auth/shared.ts:42-44`) — tracked
  as a hardening ticket, full subsystem in `epic-api-governance.md`.
- **Audit**: guest actions log with `userRole=guest` + request id; no
  persistent identity is invented.
- **CSRF**: guest is read-only, so the CSRF plugin (state-changing methods)
  is unaffected.

## Scope

- Synthetic guest auth context + `auth.guestAccess` config flag.
- Visibility-aware access checks for chats and assets (registered-public +
  open-public branches).
- Read-only public world browsing for guests.
- Guest surface for public functionality (feed, templates, docs).
- Per-IP rate limiting + audit logging for guest reads.

## Non-goals

- Guest writes of any kind (posting, joining, reacting) — out of scope until
  a persistence + abuse story exists.
- Guest-tier NSFW policy (keep deny-anonymous).
- Per-visitor guest accounts or guest session persistence.
- Changes to registered-user RBAC (the `guest` matrix row already exists).
- The full rate-limiting subsystem (`epic-api-governance.md`).

## Tickets

- `TASK-guest-context-synthetic-derive-branch-auth-guestaccess-flag.md` — synthetic guest context + config flag
- `TASK-guest-chat-public-reads-visibility-aware-chat-access.md` — visibility-aware chat access
- `TASK-guest-asset-public-reads-open-public-asset-access.md` — open-public asset reads
- `TASK-guest-world-public-browse-read-only-public-worlds.md` — read-only public world browsing
- `TASK-guest-public-functionality-surface-feed-templates-docs.md` — feed/templates/docs guest surface
- `TASK-guest-rate-limiting-audit-logging-for-guest-reads.md` — per-IP guest read limits + audit

## Related Epics

- `epic-auth-access.md` — **parent**: registration/login/MFA and the access
  checks this epic extends with the guest tier.
- `epic-chat-privacy.md` — chat visibility model (`ChatPrivacy` spec);
  this epic implements the enforcement half for the public tiers.
- `epic-frontend-login.md` — login UI; the guest entry point (continue as
  guest) lands here.
- `epic-social-hub.md` / proposed `epic-public-feed` — public story feed
  (`FEAT-public-story-feed-moderation`) is the first guest-surface consumer.
- `epic-asset-platform-capabilities.md` — asset visibility/sharing patterns.
- `epic-api-governance.md` — rate-limiting subsystem (guest read limits).
- `TASK-user-seeding-role-expansion.md` (Done) — origin of the `guest` role
  and permission-matrix row this epic wires up.

## Anchors

- `src/middleware/auth/authenticate.ts:4-12,161-182` — auth modes; solo
  fallback and 401 paths the guest branch slots between.
- `src/elysia-app.ts:93-126` — global auth derive; `userId`/`userRole`/
  `sessionId` context population.
- `src/routes/http-utils/errors.ts:101-104` — `requireUserId` canonical 401.
- `src/users/permissions.ts:79` — existing `guest` permission row.
- `src/db/enums-core/users.ts` — `UserRole` incl. `guest`;
  `ChatVisibility` private/public/unlisted.
- `src/chat/service/access.ts:115-160` — `checkChatAccess` (no visibility
  read today).
- `src/assets/service/read.ts:89-110,223-246` — `visibleAssetFilter` /
  `canAccessAsset` (actorId requirement blocks anonymous).
- `src/assets/signed-url.ts` — existing anonymous data path to reuse.
- `src/routes/chat-search/join.ts:53-55` — public-world join precedent.
- `src/middleware/auth/solo-user.ts` — synthetic-user precedent.

## Acceptance Criteria

- [ ] With `auth.guestAccess=true`, an unauthenticated request derives a
      guest context (`userRole=guest`, no user/session rows) and can reach
      read-mostly public routes; with the flag off, behavior is unchanged.
- [ ] Guest can list and read `visibility=public` chats, public assets, and
      public worlds without an account.
- [ ] No mutation route is reachable as guest (401 via `requireUserId`).
- [ ] Solo mode (`auth.required=false`, no flag) still yields the solo user
      with `["*"]` perms — no fallthrough regression.
- [ ] Registered-public tier: any authenticated user can read public
      chats/assets/worlds they are not a participant/owner of.
- [ ] NSFW gate still denies guest; guest reads are per-IP rate limited and
      audit-logged.
- [ ] Unit tests for the derive branch, both visibility tiers, and the
      solo-fallback guard; e2e smoke for a guest public-chat read.

## Implementation Phases

### Phase 1: Guest context foundation

`auth.guestAccess` flag; derive branch; `requireUserId`-adjacent guard for
read-mostly routes; unit tests (incl. solo-fallback guard).
→ `TASK-guest-context-synthetic-derive-branch-auth-guestaccess-flag.md`

### Phase 2: Visibility enforcement (chats + assets)

`checkChatAccess` / `canAccessAsset` / `visibleAssetFilter` gain
registered-public and open-public branches; public chat listing for guests.
→ `TASK-guest-chat-public-reads-visibility-aware-chat-access.md`, `TASK-guest-asset-public-reads-open-public-asset-access.md`

### Phase 3: Public worlds + public functionality

Read-only public world browsing; guest surface for story feed, public
templates, docs.
→ `TASK-guest-world-public-browse-read-only-public-worlds.md`, `TASK-guest-public-functionality-surface-feed-templates-docs.md`

### Phase 4: Hardening

Per-IP rate limits for guest reads; audit logging; e2e smoke.
→ `TASK-guest-rate-limiting-audit-logging-for-guest-reads.md`

## Notes

- The `guest` permission row (`chat.join`, `character.view`, `world.view`)
predates this epic (`TASK-user-seeding-role-expansion`, Done 2026-08-17) —
this epic is the wiring, not the matrix.
- `chats.visibility` vs the spec's `ChatPrivacy` enum
(`epic-chat-privacy.md`) mismatch is tracked in
`BUG-encryption-tier-not-enforced.md`; this epic enforces the column that
exists, not the spec enum.


git issue: 37d7b06
