// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

# BUG: BUG: random-events generator is dead/incomplete (phantom params, unconsumed)

**Status:** ✅ Done
**Priority:** low
**Effort:** Low

## Summary

`src/chat/random-events.ts` `generateRandomEvent` destructured `db`, `worldId`, `locationId` but never used them (phantom API). Its only consumer (`src/generation/auto-gen/post-store.ts`) called it and only logged the result; the event was never persisted or injected into the context window. `randomEventToEventRef` was an unconsumed export.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated (deferred — epic carries it)

## Resolution

Closed by completing the simpler half of the BUG (no new schema — the
encounter-tables / event-chains persistence scope is tracked separately by
`TASK-random-encounters-events`):

1. **Dropped phantom params** from `RandomEventOpts`. The remaining
   options are the ones the function actually consumes: `messageCount`,
   `messagesSinceLastEvent`, `participants`, `currentLocation`,
   `worldTime`. `generateRandomEvent` is now genuinely pure (no DB).
2. **Wired `applyPostStoreEffects`** to look up chat participants
   (`chat_participants JOIN actors`, mapping `actor_type === "character"`
   to role `"ai"`) and the chat's `current_location_id` row, then pass
   them to `generateRandomEvent`. Events now actually use real character
   names + the chat's actual location instead of the hollow
   `NPC_OPTIONS` fallback.
3. **`randomEventToEventRef` now has a consumer**: post-store converts
   each generated event to an `EventRef` and logs the would-be injection
   (`tokenCount`, `eventId`, `category`). The `EventRef` is ready for the
   future wiring that hands it to `injectEvents` on the next prompt
   build; the persistence half (per-row ambient event log) is tracked
   separately by `TASK-random-encounters-events` and was intentionally
   not added here to avoid premature schema.
4. **Returned `undefined` instead of `null`** for "no eligible event";
   `RandomEvent | undefined` is the conventional TypeScript shape and
   removes a `unicorn/no-null` oxlint warning.
5. **Cleaned all 10 oxlint warnings** (`999` magic number → constant,
   `e`/`roll` short ids → descriptive names, `null` literal → undefined,
   sort-keys in the return object, magic `4` divisor → constant,
   `func-style` arrow expression). `bunx oxlint src/chat/random-events.ts`
   no longer reports the warnings that previously blocked the
   `lint-ts` gate.
6. **Added tests**: `random-events.test.ts` now also covers
   `randomEventToEventRef` (EventRef conversion + token-count math) and
   the `undefined` return path. All 6 random-events tests pass;
   `bun test src/chat/` 315/315 pass; `bun test src/generation/auto-gen/`
   27/27 pass (7 ISOLATED-gated skips unchanged).
