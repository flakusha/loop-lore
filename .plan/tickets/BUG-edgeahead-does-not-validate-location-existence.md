<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: edgeAhead does not validate location existence

**Status:** Done
**Status Note:** `edgeAhead` now takes the world's live location ids and filters inside itself (`src/rpg/world-discovery/trade.ts:163-169`); `readMovingParties` passes the set it already builds (`trade.ts:113`), so no caller can forget the check. The ticket's stated impact was already prevented at the call site by commit d5d081305 ("fix: LOW world/travel — dead code, DB handle, location validation"), so this moves the existing guard to the function that owns it instead of adding a second one.
**Priority:** low
**Effort:** Medium
**Caveats:** stale state — the live-location set is read once per tick, so a location deleted between that read and the convoy write is still named as a destination for that tick; observability — a convoy whose next hop was deleted reports `to: null` instead of a stale id, so the event says "no destination" rather than naming a location that no longer exists

**Summary:**

edgeAhead (src/rpg/world-discovery/trade.ts:152-157) parses the route and returns route[routeIndex + 1] without checking that the location still exists. Impact: Trade events reference non-existent locations. Fix: Accept an alive: Set`<string>` parameter and filter.

**Context:**

A route is free-text JSON with no foreign key, so it can name a location the world has since deleted, and a `trade:route` event must never point at a location that does not exist. The ticket asks for the check inside `edgeAhead`; that is where it now lives, so the helper cannot be misused by a future caller. Behaviour is unchanged: `readMovingParties` already filtered on the same set (commit d5d081305), so the observable impact the ticket describes was already prevented and this is a move, not a new rule.

Alternatives rejected: leaving the filter at the call site (the ticket's premise was that nobody checked at all — the caller did); validating the route inside `travel.ts`/`walk()` (a different subsystem, which namespaces ids as `worldId + ":" + id`); resolving each route id against the world inside `edgeAhead` (that would put a database handle in a pure helper).

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

- `src/rpg/world-discovery/trade.ts`: `edgeAhead(raw, routeIndex, alive)` returns `null` when the next hop is missing or the world no longer has it; `readMovingParties` passes `alive` and no longer re-checks the result.
- `src/rpg/world-discovery/trade.test.ts`: new case "a route that names a location the world no longer has reports no destination" — the convoy still fires and `to` is `null`.

**Resolved:** 2026-10-22 registry-driven close: git issue 649e9eb (registry tip: 43162eb25 Konstantin Fedotov Auto-closed: appended .md marker marks BUG-EDGEAHEAD-DOES-NOT-VALIDATE-)
