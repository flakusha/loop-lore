<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Aggregated traits endpoint silently dropped by shadowed subdir barrel

**Summary:** `src/routes/character-traits/bulk.ts` served `GET /api/actors/:actorId/traits` as an aggregated cross-layer lookup honoring `?worldId=` / `?locationId=`. It was wired only by the shadowed subdir barrel, never by the reachable flat `character-traits.ts`, so the aggregated variant is not registered.
**Context:** The reachable `permanent.ts` owns the same method+path but returns permanent-layer traits only. Callers get HTTP 200 with permanently-filtered results instead of an error, so the loss is invisible. No test covers the bulk surface.
**Acceptance Criteria:** A decision is made on the aggregated lookup (restore it, or confirm it is intentionally retired and remove the reference), and the outcome is covered by a test that asserts GET semantics with and without `?worldId=`/`?locationId=`.

**Status:** Done
**Priority:** medium
**Effort:** Small
**Type:** Bug
**Tags:** routes, rpg, database, silent-regression

## Summary

`src/routes/character-traits/bulk.ts` defined an aggregated trait lookup:

```
GET ${prefix}/actors/:actorId/traits
  -> TraitsService.getAllTraits(actorId, worldId, locationId)
  -> honors ?worldId= and ?locationId=
```

That sub-plugin was assembled by `src/routes/character-traits/index.ts` and by
nothing else. That barrel was unreachable — node resolution prefers
`character-traits.ts` over `character-traits/index.ts` for the specifier
`"../routes/character-traits"`, and both registered the Elysia plugin name
`character-traits`, so only one could ever be live.

The reachable flat `src/routes/character-traits.ts` wires only three sub-plugins:

| module | wired by flat file? |
| --- | --- |
| `permanent.ts` | yes |
| `world.ts` | yes |
| `location.ts` | yes |
| `bulk.ts` | **no** |

## Evidence

Route table of the reachable `characterTraitsRoutes` (10 routes):

```
GET    /api/actors/:actorId/traits              <- permanent layer only
GET    /api/actors/:actorId/traits/world/:worldId
GET    /api/actors/:actorId/traits/location/:locationId
POST   /api/actors/:actorId/traits
...
```

`grep -rn 'bulkTraitsRoutes' src` returns no matches: nothing registers it.
`src/routes/character-traits.test.ts` has permanent/world/location coverage and
no bulk coverage, which is why no gate caught the loss.

## Why this is silent

`permanent.ts:34` registers `GET /api/actors/:actorId/traits` and calls
`getPermanentTraits`. A request carrying `?worldId=` therefore returns 200 with
permanent traits only — no 404, no error, no warning. Callers asking for an
aggregated view get a plausible but wrong payload.

## Acceptance Criteria

- [ ] The aggregated lookup is either re-wired into the reachable
      `characterTraitsRoutes` or confirmed retired, with the decision recorded
- [ ] A test asserts GET `/api/actors/:actorId/traits` with and without
      `?worldId=` / `?locationId=`, pinning whichever semantics are chosen
- [ ] `bun test src/routes/character-traits.test.ts` green

## Update 2026-09-29: bulk.ts is now deleted

`refactor(routes): drop dead character-traits subdir barrel` landed on `dev` as
`08038e2c1`, which removed `index.ts`, `bulk.ts`, and `types.ts`. The directory now
holds only `location.ts`, `permanent.ts`, and `world.ts`.

That changes the first acceptance criterion. The original wording offered two
outcomes, one of which was to re-wire `bulk.ts` into the reachable
`characterTraitsRoutes`. Re-wiring now means resurrecting deleted code, so the
choice is narrower and should be made explicitly:

1. **Re-create** `bulk.ts` from `git show 08038e2c1^:src/routes/character-traits/bulk.ts`
   and wire it into the flat `characterTraitsRoutes`.
2. **Retire** the aggregated endpoint, and make the silent-wrong-payload behavior
   impossible: `permanent.ts:34` currently answers `?worldId=` with permanent-layer
   traits only and HTTP 200. Retirement should at minimum reject or ignore-and-warn
   on the aggregation parameters so a caller cannot receive a plausible wrong payload.

Either way the second criterion is the load-bearing one. The silent-200 is the actual
defect; which handler serves the route is secondary. Note that `src/routes/character-traits.ts`
(a file) and `src/routes/character-traits/` (a directory) coexist and the file wins
module resolution — that shadowing is the root cause and is now the only barrier left.

## Notes on provenance

Found while reviewing `refactor(routes): drop dead character-traits subdir
barrel`. Pre-existing and unrelated to that commit — the endpoint was already
unreachable before the barrel was deleted. The deletion is a genuine no-op; the
loss happened earlier, when the two modules collided.


git issue: 22f20a2


## Verification Notes (2026-10-01)

Re-verified against current `dev`; the defect described in this ticket is
already fixed. The ticket was left open past the fix.

Evidence: `src/routes/character-traits/`

- The subdir barrel was removed in `08038e2c1`; the directory now holds only `location.ts`, `permanent.ts`, and `world.ts`. The aggregated endpoint is intentionally retired, which is the option this ticket's own 2026-09-29 update asked to be made explicit.
