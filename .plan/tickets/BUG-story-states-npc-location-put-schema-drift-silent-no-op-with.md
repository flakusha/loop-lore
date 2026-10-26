<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: story-states npc/location PUT schema drift: silent no-op with vacuous green e2e

**Status:** Done
**Status Note (2026-10-26 gate fallout):** the schema alignment landed (`NpcStateBody`/`LocationStateBody` now mirror the handler field set + `minProperties: 1`), which left two artifacts behind: (1) `src/validation/schema-fuzz.generated.test.ts` failed on `NpcStateBody` with counterexample `{}` — the fuzz mapper (`src/test-utils/schema-arbitrary.ts`) ignored `minProperties`, so it generated an empty object the schema correctly rejects; the mapper now promotes the first declared optional keys until the floor is met (`SchemaNode.minProperties` added in `schema-arbitrary-scalars.ts`). (2) `tests/e2e/flows/notification-world-mute.test.ts` still sent the obsolete `{npc_id, state_key, state_value}` body and got 422 — it now sends `{mentalState: "resting"}` and asserts the persisted `npc_states.mental_state`, closing the vacuous green flagged in this ticket.
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

story-states npc/location PUT: documented body is a silent no-op, handler-shaped body 422s; e2e greens over the no-op (probe-confirmed).

**Files:**

- src/validation/schemas/world-state.ts:18-28 (`NpcStateBody`/`LocationStateBody` require `npc_id|location_id`, `state_key`, `state_value`)
- src/routes/story-states/handlers.ts:40-66 (npc handler reads `health`, `mentalState`, `knowledge`, `relationships`, `schedule`, `locationId`)
- src/routes/story-states/handlers.ts:135-154 (location handler reads `description_override`, `atmosphere`, `time_of_day`, `weather`, `npcsPresent`, `itemsAvailable`, `hazards`)
- tests/e2e/flows/notification-world-mute.test.ts:141-146

**Evidence:**

- Probe `scratch/probe-npc.ts`: `PUT handler-shaped fields: 422 {"type":"validation","on":"body","property":"/npc_id"...}`; `PUT schema-shaped body: 200 {...}`; `row after: {...} <- nothing written` (review-surfaces.md S-3).
- Documented body silently updates nothing (only `updated_at` bumped, stale row echoed); handler body rejected as 422.
- Ghost PUT (probe `probe-npc-ghost.ts`) against a world-owned actor with no `npc_states` row returns 500 (`jsonResponse(null)` at handlers.ts:84).
- Sole consumer is the e2e test, which sends the schema shape and asserts only `status === 200`; the GM-action notification it waits for fires unconditionally (handlers.ts:77-82), so the suite passes while the write is a no-op.

**Fix:**

Align `NpcStateBody`/`LocationStateBody` to the handler field set (or vice versa — pick the intended contract); make the e2e assert the written row state, not just status 200. Also handle the null-state 500.

**Review:** .tmp/reviews/2026-10-25/ (2026-10-25 round) — review-surfaces.md S-3.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 065ca42 (registry tip: afedcf68c Konstantin Fedotov Close issue)
