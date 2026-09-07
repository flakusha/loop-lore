<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: TurnManager strategies have no consecutive-turn guard — an actor can speak twice in a row when strategy weight ties

**Status:** ✅ Resolved (verified via commit 359a3d3; bookkeeping)
**Severity:** medium
**Priority:** medium
**Effort:** small
**Type:** BUG
**Epic:** epic-chat-lifecycle-moderation
**Files:** src/turning/turn-manager/selection.ts; src/turning/turn-strategies.ts; src/generation/auto-gen/group-cascade.ts:70-86

## Issue

`TurnManager.selectNextActor(strategy, context)` selects an actor purely based on strategy weight (talkativity + recency + random). When strategy weights tie or all candidate scores converge to the same value, the same actor who just spoke can be picked again — there's no "skip the last speaker" guard in the strategies themselves.

Compounding this: `group-cascade.ts:76-79` has a partial mitigation that **swaps to `others[0]`** (the first non-previous actor in the participant array) when TurnManager returns the same actor. But this is order-dependent (always first in DB), not strategy-aware, and isn't applied to all strategy paths.

The deeper fix belongs in `TurnManager` strategies themselves — they should know about the last actor and skip them when other candidates exist.

## Why it matters

Coherence. A strategy tied on weights produces ping-pong (A→B→A→B) or a single actor monopolizing the cascade. In a 2-actor group, the "skip" fallback may itself be the only alternative; in 3+ actors, the fallback picks `others[0]` deterministically (first in array), erasing strategy intent.

## Evidence

- `src/turning/turn-strategies.ts` — strategies compute score but have no consecutive-actor guard.
- `src/turning/turn-manager/selection.ts` — selects from strategy output without filtering by `lastActor`.
- `src/generation/auto-gen/group-cascade.ts:76-79` — partial mitigation that picks `others[0]` (already partially addressed by `BUG-group-cascade-max-turns-off-by-one`, but the deeper fix should live in TurnManager).
- No test exercises "two-actor group with equal weights → same actor speaks twice in a row".

## Concrete fix

1. Extend each `TurnStrategy` interface (`turn-strategies.ts`) with an optional `lastActorId?: string` field on the `TurnContext` input.
2. Each strategy's `selectNext` should, when multiple candidates exist, filter out `lastActorId` before applying its weight computation. If filtering leaves zero candidates, fall back to all candidates (single-actor edge case).
3. Remove the `others[0]` fallback in `group-cascade.ts:76-79` — it's now redundant.
4. Tests:
   - 3-actor group, equal talkativity weights, actor A speaks → next pick is B or C (not A).
   - 2-actor group with equal weights → actor A speaks → next pick is B (forced; only alternative).
   - Single-actor group → only candidate is the active speaker; no crash, fall through.
   - Tie-breaking is deterministic and stable (same input → same output).

## Tests

- `bun test src/turning/turn-strategies.test.ts` — add 3 cases above per strategy (round-robin, weighted, random).
- `bun test src/generation/auto-gen-cascade.test.ts` — remove the `others[0]` assertion; assert strategy-driven selection.

## Related

- `BUG-group-cascade-max-turns-off-by-one` (covers the `others[0]` half of this same code area; the *consecutive guard* here is the strategy-level fix).
- `epic-chat-lifecycle-moderation.md`.

## Resolution

Verified via commit 359a3d3. All five turn strategies (roundRobinSelect / sceneBasedSelect / initiativeSelect / questDrivenSelect / hybridSelect) in src/turning/turn-strategies.ts now skip `lastActorId` when at least one alternative exists. Single-participant chats still pick that actor (no alternative). Covered by src/turning/turn-strategies-consecutive.test.ts (9 cases).
