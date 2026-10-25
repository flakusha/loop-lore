<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Guest world public browse: read-only public worlds

**Status:** Done
**Scope:** Guest Access epic Phase 3: read-only public world browsing for the guest tier
**Priority:** high
**Effort:** Medium
**Epic:** epic-guest-access

**Summary:**

## Problem

WorldVisibility.Public worlds are joinable by non-members (src/routes/chat-search/join.ts) but there is no read-only browse path for unauthenticated visitors.

## Change

- Guest can list WorldVisibility.Public worlds and read their public metadata (name, description, locations, NPCs) without joining.
- No world join, no chat creation, no participation for guests.
- Registered users keep the existing join flow.
- Public world listing endpoint accepts guest context (read-only).

## Acceptance

- Guest lists public worlds and reads public world detail.
- Guest cannot join or mutate anything in a world.
- Private/unlisted worlds invisible to guest.
- Registered join flow unchanged.

**Context:**

World listing joined the Phase 1 detail read; the location reads opted in on the same per-route pattern.

- `src/routes/worlds/worlds.ts` — `handleListWorlds` takes `userRole` now and gates its null-userId arm on the `world.view` grant (`src/routes/worlds/worlds-routes.ts` passes it through from `extractAuth`): a guest (`userId` null, role `guest`) lists PUBLIC worlds only; an id-less caller WITHOUT the guest role (derive denied the request, bare test double) matches nothing — no account-less enumeration, mirroring the chat list's public-arm gate (`visibleToViewer`, Phase 2). Unlisted and private worlds stay invisible; the owned/public/member arms for authenticated callers are unchanged.
- `src/routes/worlds/locations.ts` — `handleListLocations` and `handleGetLocation` opt in with `requireWorldAccess(..., { allowGuest: true })`, the Phase 1 pattern (`handleGetWorld`): a guest reads the locations of a PUBLIC world, gets 404 on a private/unlisted world's locations. Location create/update/move/delete stay behind `requireWorldOwner`, which denies the null user id with 403.
- `src/routes/characters/list.ts` — `GET /api/actors` gained the guest arm the single-actor read (`src/routes/characters/read.ts`) already had: PUBLIC actors only, gated on `character.view`; an id-less caller without the tier matches nothing. Before this change a null-id caller listed every user's cast (the owner filter was simply dropped) — the tier fix closes that hole. The registered arm (own + ownerless) is unchanged.
- Deliberately closed: the world→chats view, timelines, conditions, karma, factions, storage, export, and the GM state routes (`src/routes/story-states/*`) keep their existing guards — gameplay/GM surfaces, not public metadata. World join/creation flows are untouched (`requireUserId` / `requireWorldOwner` deny guests).

Tests: `src/routes/worlds/worlds-routes.test.ts` (guest lists PUBLIC only — private and unlisted excluded; id-less/role-less caller gets an empty list; guest detail 200/404 and create 401 carried from Phase 1; registered non-member reads and lists a PUBLIC world, private stays 404), `src/routes/worlds/locations-routes.test.ts` (new guest describe: list + single read on a public world, private world 404, create 403), `src/routes/characters/list.test.ts` (new: guest lists only public actors, role-less sees nothing, registered arms unchanged).

The solo-fallback guard stays pinned by `src/middleware/auth/guest-access.test.ts` (Phase 1): the guest branch is reachable only when `auth.required` is true, so a solo deployment never degrades.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue 495ce0f (registry tip: b6595fa66 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-GUEST-WORLD-PUBLIC-BROWSE-R)
