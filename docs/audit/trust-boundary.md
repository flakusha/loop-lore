# Trust-boundary audit: routes that read `actorId`

**Ticket:** TASK-trust-boundary-audit-pass
**Branch:** `refactor-trust-boundary-audit`
**Status:** read-only audit; no `src/` files modified.
**Method:** for each route handler that consumes `query.actorId`,
`body.actorId`, or `params.actorId`, verify whether the handler scopes
the operation by `ctx.userId` (or a `ctx.userId`-derived ownership check)
before reading or writing the actor's data.

## Authentication model (baseline)

The Elysia app derives `ctx.userId` for every request
(`src/elysia-app.ts`, the `.derive(async ({ request }) => { ... })` block).
Unauthenticated requests get `ctx.userId === null`. The convention is:

> Route handlers check for `userId === null` and return 401.
> — `src/elysia-app.ts` line 77 (auth derive comment).

There is no global `onBeforeHandle` enforcing auth. **Any handler that
fails to call `requireUserId(ctx)` is anonymous-accessible.** This is
the audit's central observation: nearly every handler that touches
`actorId` does call `requireUserId(ctx)` (or an equivalent guard
`requireActorAccess` / `checkActorOwnership`) before reading the
parameter, with one critical exception documented below.

The guards in scope:

- `requireUserId(ctx)` — `src/routes/http-utils/responses.ts` returns
  the `userId` string or a 401 `Response`. Caller must early-return on
  the `Response`.
- `requireActorAccess(database, targetActor, ctx)` —
  `src/routes/nsfw/shared.ts` wraps `requireUserId(ctx)` +
  `checkActorOwnership(database, targetActor, userId, role)` and
  returns a 403 on ownership failure.
- `resolveActorAccess(database, actorId, userId)` —
  `src/routes/battle/equipment-durability.ts` does an inline
  `actors.user_id` lookup with 404/403 responses.
- `resolveWorldOwner(database, worldId, userId)` — same pattern but
  on `worlds.owner_id`. Used by crafting/recipes and rpg
  crafting-station routes that are world-scoped rather than
  actor-scoped.

## Path-resolution caveat (read this first)

The candidate file list supplied to the audit contains paths from an
older snapshot of the codebase. The table below maps each candidate
to its current location; the audit was performed against the current
location, not the candidate path.

| Candidate path | Actual path | Status |
|---|---|---|
| `src/routes/rpg/equipment.ts` | `src/routes/battle/equipment.ts` | moved to `battle/` |
| `src/routes/rpg/fantasies.ts` | `src/routes/nsfw/fantasies.ts` | moved to `nsfw/` |
| `src/routes/crafting/recipes/crud.ts` | `src/routes/crafting/recipes.ts` | coalesced |
| `src/routes/crafting/recipes/helpers.ts` | (no equivalent) | deleted |
| `src/routes/crafting/recipes/index.ts` | (no equivalent) | deleted |
| `src/routes/crafting/types.ts` | (no equivalent) | deleted |
| `src/routes/crafting/process.ts` | `src/routes/rpg/crafting-execution.ts` | moved to `rpg/` |
| `src/routes/intimacy/service/{actions,pairs,index}.ts` | `src/rpg/intimacy/service/{actions,pairs,index}.ts` | routes → `src/routes/nsfw/intimacy.ts` |
| `src/routes/seduction/service/{types,arousal}.ts` | `src/rpg/seduction/service/{types,arousal}.ts` | routes → `src/routes/nsfw/seduction.ts` |
| `src/routes/character-internal-traits/index.test.ts` | unchanged | test file, out of scope |
| `src/routes/character-world-setup.test.ts` | unchanged | test file, out of scope |

Service-layer files (the `src/rpg/intimacy/service/*` and
`src/rpg/seduction/service/*` sets) are **not** route handlers and are
out of scope for this audit; they are invoked by the in-scope route
handlers (`src/routes/nsfw/intimacy.ts`,
`src/routes/nsfw/seduction.ts`), all of which already gate by
`requireActorAccess` before any service call.

## Findings table

| # | file:line | pattern | current scoping | risk | recommended fix |
|---|---|---|---|---|---|
| 1 | `src/routes/battle/equipment.ts:170` (`POST /api/battle/equipment/loot`) | write (`body.actorId` + `worldItemIds` write via `items.giveToNpc` / `items.placeInLocation`) | **none** — handler never calls `requireUserId`; only `ctx.body` is read; the operation persists `world_items` rows | **critical** | add `const userId = requireUserId(ctx,); if (typeof userId !== "string") { return userId; }` at line 172 and verify the caller owns `body.worldId` (world ownership) before persisting; reject anonymous requests outright. |
| 2 | `src/routes/battle/equipment-durability.ts:103` (`POST /api/battle/equipment/combat-use`) | write (`body.actorId` → `degradeActorEquipment`) | session — `requireUserId(ctx)` at line 101, then `resolveActorAccess` compares `actors.user_id` to `userId` | none | — |
| 3 | `src/routes/nsfw/intimacy.ts:23` (`GET /api/nsfw/intimacy/:actorId/:targetId`) | read (`params.actorId`) | session — `requireActorAccess(database, ctx.params.actorId, ctx)` | none | — |
| 4 | `src/routes/nsfw/intimacy.ts:42` (`GET /api/nsfw/intimacy/:actorId`) | read (`params.actorId`) | session — `requireActorAccess(...)` | none | — |
| 5 | `src/routes/nsfw/intimacy.ts:62` (`POST /api/nsfw/intimacy/action`) | write (`body.actorId`) | session — `requireActorAccess(database, body.actorId, ctx)` | none | — |
| 6 | `src/routes/nsfw/seduction.ts:23` (`GET /api/nsfw/desire/:actorId`) | read (`params.actorId`) | session — `requireActorAccess(...)` | none | — |
| 7 | `src/routes/nsfw/seduction.ts:37` (`PUT /api/nsfw/desire/:actorId`) | write (`params.actorId`) | session — `requireActorAccess(...)` | none | — |
| 8 | `src/routes/nsfw/seduction.ts:55` (`GET /api/nsfw/skills/:actorId`) | read (`params.actorId`) | session — `requireActorAccess(...)` | none | — |
| 9 | `src/routes/nsfw/seduction.ts:71` (`POST /api/nsfw/seduction/attempt`) | write (`body.actorId`) | session — `requireActorAccess(database, body.actorId, ctx)` | none | — |
| 10 | `src/routes/nsfw/seduction.ts:91` (`GET /api/nsfw/arousal/:actorId`) | read (`params.actorId`) | session — `requireActorAccess(...)` | none | — |
| 11 | `src/routes/nsfw/seduction.ts:106` (`POST /api/nsfw/arousal/:actorId`) | write (`params.actorId`) | session — `requireActorAccess(...)` | none | — |
| 12 | `src/routes/nsfw/fantasies.ts:23` (`GET /api/nsfw/fantasies/:actorId`) | read (`params.actorId`) | session — `requireActorAccess(...)` | none | — |
| 13 | `src/routes/nsfw/fantasies.ts:38-58` (`POST /api/nsfw/fantasies`) | write (`body.actorId`) | session — `requireActorAccess(database, body.actorId, ctx)` | none | — |
| 14 | `src/routes/nsfw/fantasies.ts:62-77` (`POST /api/nsfw/fantasies/discover`) | write (`body.actorId`) | session — `requireActorAccess(database, body.actorId, ctx)` | none | — |
| 15 | `src/routes/trade/history.ts:22-30` (`GET /api/worlds/:worldId/trade/history`) | read (`query.actorId` optional) | session — `requireUserId(ctx)` at line 22; `resolveActorAccess(opts.database, actorId, userId)` at line 27 when `actorId` is supplied | none | — |
| 16 | `src/routes/trade/index.ts:45-52` (`GET /api/worlds/:worldId/trade/balance`) | read (`query.actorId`) | session — `requireUserId(ctx)` at line 45; `resolveActorAccess(database, actorId, userId)` at line 49 | none | — |
| 17 | `src/routes/trade/offers.ts:24-33` (`POST /api/worlds/:worldId/trade/offers`) | write (`body.buyerActorId` + `body.sellerActorId`) | session — `requireUserId(ctx)` at line 24; `resolveActorAccess(opts.database, body.buyerActorId, userId)` at line 32 confirms the buyer actor is owned by the caller | none | — |
| 18 | `src/routes/trade/offers.ts:62-69` (`GET .../offers?actorId=`) | read (`query.actorId`) | session — `requireUserId(ctx)` + `resolveActorAccess(opts.database, actorId, userId)` | none | — |
| 19 | `src/routes/trade/offers.ts:98-106` (`POST .../offers/:offerId/accept`) | write (`body.sellerActorId`) | session — `requireUserId(ctx)` + `resolveActorAccess(opts.database, body.sellerActorId, userId)` | none | — |
| 20 | `src/routes/trade/offers.ts:122-130` (`POST .../offers/:offerId/cancel`) | write (`body.buyerActorId`) | session — `requireUserId(ctx)` + `resolveActorAccess(opts.database, body.buyerActorId, userId)` | none | — |
| 21 | `src/routes/character-relationships.ts:34-41` (`GET /api/actors/:actorId/relationships`) | read (`params.actorId`) | session — `requireActorAccess(ctx, database)` returns userId after ownership check | none | — |
| 22 | `src/routes/character-relationships.ts:56-63` (`GET /api/actors/:actorId/relationships/:targetActorId`) | read (`params.actorId`) | session — `requireActorAccess(ctx, database)` | none | — |
| 23 | `src/routes/character-relationships.ts:84-108` (`POST /api/actors/:actorId/relationships`) | write (`params.actorId`) | session — `requireActorAccess(ctx, database)` | none | — |
| 24 | `src/routes/character-relationships.ts:133-140` (`PUT /api/actors/:actorId/relationships/:targetActorId`) | write (`params.actorId`) | session — `requireActorAccess(ctx, database)` | none | — |
| 25 | `src/routes/character-relationships.ts:162-169` (`DELETE /api/actors/:actorId/relationships/:targetActorId`) | delete (`params.actorId`) | session — `requireActorAccess(ctx, database)` | none | — |
| 26 | `src/routes/character-relationships.ts:184-197` (`POST /api/actors/:actorId/relationships/events`) | write (`params.actorId`) | session — `requireActorAccess(ctx, database)` | none | — |
| 27 | `src/routes/character-world-setup.ts:33-43` (`GET /api/actors/:actorId/world-setup/:worldId`) | read (`params.actorId`) | session — `requireUserId(ctx)` + `checkActorOwnership(database, actorId, userId, ...)` | none | — |
| 28 | `src/routes/character-world-setup.ts:61-71` (`GET .../resolve`) | read (`params.actorId`) | session — same | none | — |
| 29 | `src/routes/character-world-setup.ts:89-101` (`PUT ...`) | write (`params.actorId`) | session — same | none | — |
| 30 | `src/routes/character-world-setup.ts:127-137` (`DELETE ...`) | delete (`params.actorId`) | session — same | none | — |
| 31 | `src/routes/character-internal-traits/index.ts:82-90` (`GET /internal-traits?actorId=`) | read (`query.actorId`) | session — `requireActorAccess` invoked with `{ ...ctx, params: { actorId } }` (lines 84-89) | none | — |
| 32 | `src/routes/character-internal-traits/index.ts:107-118` (`PUT` / `POST`) | write (`query.actorId`) | session — `requireActorAccess` invoked the same way | none | — |
| 33 | `src/routes/character-internal-traits/index.ts:137-144` (`DELETE`) | delete (`query.actorId`) | session — `requireActorAccess` invoked the same way | none | — |
| 34 | `src/routes/character-internal-traits/index.ts:162-170` (`buildPromptSection`) | read (`query.actorId`) | session — `requireActorAccess` invoked the same way | none | — |
| 35 | `src/routes/crafting/attempt.ts:94-98` (`POST .../craft-attempts`) | write (`body.actorId`) | session — `requireUserId(ctx)` + `resolveActorAccess(database, body.actorId, userId)` | none | — |
| 36 | `src/routes/crafting/attempt.ts:124-129` (`GET /api/worlds/:worldId/actors/:actorId/craft-attempts`) | read (`params.actorId`) | session — `requireUserId(ctx)` + `resolveActorAccess(database, ctx.params.actorId, userId)` | none | — |
| 37 | `src/routes/crafting/attempt.ts:146-150` (cancel attempt) | write (`attempt.actorId`) | session — `requireUserId(ctx)` + `resolveActorAccess(database, attempt.actorId, userId)` | none | — |
| 38 | `src/routes/crafting/orders.ts:106-111` (`GET .../orders?actorId=`) | read (`query.actorId` optional) | session — `requireUserId(ctx)` + `resolveActorAccess(database, actorId, userId)` when present | none | — |
| 39 | `src/routes/crafting/orders.ts:165-168` (`POST .../orders/:orderId/cancel`) | write (`body.actorId`) | session — `requireUserId(ctx)` + `resolveActorAccess(database, body.actorId, userId)` | none | — |
| 40 | `src/routes/crafting/recipes.ts` (entire file) | n/a | `actorId` is **not** referenced; routes are gated by world ownership via `resolveWorldOwner(database, worldId, userId)` | none | — |
| 41 | `src/routes/crafting/station-defs.ts` | n/a | `actorId` is **not** referenced; world ownership | none | — |
| 42 | `src/routes/crafting/station-instances.ts` | n/a | `actorId` is **not** referenced; world ownership | none | — |
| 43 | `src/routes/crafting/stations.ts` | n/a | barrel mounting 41+42; no actorId handling | none | — |
| 44 | `src/routes/rpg/crafting-execution.ts:20,37-43` (`POST /api/rpg/craft`) | write (`body.actorId`) | session — `requireUserId(ctx)` + inline `actors.user_id === userId` ownership check | none | — |
| 45 | `src/routes/rpg/stats-actor.ts:48-51` (`GET /api/rpg/stats/:actorId`) | read (`params.actorId`) | session — `requireActorAccess(ctx, database)` | none | — |
| 46 | `src/routes/rpg/stats-actor.ts:72-97` (`POST /api/rpg/stats/:actorId`) | write (`params.actorId`) | session — `requireActorAccess(ctx, database)` | none | — |
| 47 | `src/routes/rpg/stats-actor.ts:130-159` (`PATCH /api/rpg/stats/:actorId`) | write (`params.actorId`) | session — `requireActorAccess(ctx, database)` | none | — |
| 48 | `src/routes/rpg/crafting-stations.ts` | n/a | `actorId` not referenced; world ownership | none | — |
| 49 | `src/routes/rpg/crafting-station-instances.ts` | n/a | `actorId` not referenced; world ownership | none | — |

## Risk summary

| Risk | Count |
|---|---|
| critical | 1 |
| high | 0 |
| medium | 0 |
| low | 0 |
| none | 48 |

**One file flagged for refactor:** `src/routes/battle/equipment.ts`
(`POST /api/battle/equipment/loot`). The handler writes to
`world_items` via `items.giveToNpc` / `items.placeInLocation` and
performs no `requireUserId` or world-ownership check. Any anonymous
caller can mint loot into any `worldId` / `actorId` / `locationId`. The
fix is to add `requireUserId(ctx)` and verify the caller owns the
supplied `worldId` before persisting.

## Notes & caveats

- Service-layer files under `src/rpg/intimacy/service/*` and
  `src/rpg/seduction/service/*` are **not** route handlers and were
  not directly audited. They are reached only through the audited
  route handlers (`src/routes/nsfw/intimacy.ts`,
  `src/routes/nsfw/seduction.ts`, `src/routes/nsfw/fantasies.ts`),
  all of which already gate by `requireActorAccess` before any
  service call.
- The `crafting/recipes/crud.ts`, `crafting/recipes/helpers.ts`,
  `crafting/recipes/index.ts`, `crafting/types.ts`,
  `crafting/process.ts`, and `intimacy/service/*` /
  `seduction/service/*` files in the candidate list do not exist at
  the supplied paths. The audit was performed against the files
  that currently occupy those responsibilities in the tree.
- `character-internal-traits/index.test.ts` and
  `character-world-setup.test.ts` are test files. They read
  `actorId` only to construct fixtures; they do not exercise a
  trust boundary in production code and are out of scope for this
  audit.
- The audit relies on `requireUserId(ctx)` returning a `Response`
  on the unauthenticated branch. This convention is documented at
  `src/elysia-app.ts:77` and is followed by every handler in the
  table above except finding #1.