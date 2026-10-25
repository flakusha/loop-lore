<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Item definition route: non-array properties.effects causes unhandled 500

**Status:** Done
**Status Note:** fixed 2026-10-25 (`fix-item-effects-500`) — the route rejects a non-array `properties.effects` with 400 BadRequest before `createDefinition` runs
**Priority:** high
**Effort:** Medium
**Tags:** story-items
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

POST /api/v1/worlds/:worldId/items funnels into createDefinition, which runs parseItemEffects(def.properties.effects) outside any try/catch (src/story/items/definitions.ts:25). The route handler's catch (src/routes/story-items/handlers.ts:175-178) only catches DuplicateItemDefinitionError, so a client POSTing properties as {"effects": "x"} (non-array) gets an unhandled InvalidItemEffectsError -> 500 instead of 400.

Repro: POST /api/v1/worlds/:worldId/items with body {"name": "Sword", "properties": {"effects": "x"}}.

Root cause: parseItemEffects throws InvalidItemEffectsError (src/story/items/effects.ts:57) for a non-array effects value; no layer converts it to a 400.

Expected: 400 BadRequest with a clear message (properties.effects must be an array of effect objects) before createDefinition runs. Fix at the route/validation layer, following the handler's existing jsonError/BadRequest conventions.

**Context:**

`POST /api/v1/worlds/:worldId/items` ran `parseItemEffects(def.properties.effects)` inside
`createDefinition` without a guard, and the route's catch only handled
`DuplicateItemDefinitionError`, so a non-array `effects` value escaped as a 500.

Fixed at the route/validation layer, following the handler's existing
`jsonError`/`BadRequest` conventions: a non-array `properties.effects` is now
answered with 400 BadRequest before `createDefinition` runs. Covered by
`src/routes/story-items/routes.coverage.test.ts`.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
