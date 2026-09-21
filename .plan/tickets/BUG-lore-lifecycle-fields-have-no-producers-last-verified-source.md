<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: lore lifecycle fields have no producers (last_verified, source_count, distortion_level)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-lore-knowledge

## Summary

Migration `005_world_lore_lifecycle` (in `TASK-world-lore-lifecycle-confidence-decay-distortion`, merged `190a6ea9b`) added `last_verified`, `source_count`, `distortion_level`, and `disputed` columns to `world_lore_entries`. **Nothing in the runtime writes to any of them.** Only INSERT-time defaults from the migration (`confidence=100, distortion_level=0, source_count=1, disputed=0, last_verified=null`) flow through; `last_verified` never advances, `source_count` is never incremented on corroboration, `distortion_level` is never updated on noise, and `disputed` is a manual flag with no UI surface.

In this worktree we add one minimal producer (prompt-side): when a `world_lore_entries` row is included via `loreSection`, set `last_verified = now` alongside the existing `last_activated` write. This activates the column with no LLM dependency. The remaining producers (`source_count` via corroboration, `distortion_level` via LLM/noise-event) stay deferred.

## Context

- `lore.ts` (line ~125) already runs an `updateTable("actor_lore_entries")` then falls back to `world_lore_entries` for `last_activated`. We piggyback on that path.
- `disputed` column is treated as a manual flag in `lore-lifecycle-gate.ts:isLoreDisputed` — no automatic trigger; suitable for an admin route (out of scope).
- The decay gating in `BUG-lore-decay-gate-is-dead-code-…` ticket also depends on `last_verified` not being NULL to apply — wiring the prompt-side write is the precondition for any future decay plumbing.

## Acceptance Criteria

Patch in this worktree (minimal C producer):

- [ ] `lore.ts` update writes `last_verified = now` together with `last_activated = now` for `world_lore_entries` rows (skip `actor_lore_entries`, which has no such column)
- [ ] One new `lore.test.ts` case: insert a row, run loreSection, assert `last_verified` is non-null after
- [ ] `bun run check --diff-base dev` passes

Out of scope (separate tickets if pursued):

- [ ] `source_count` producer — increment on a corroboration event (e.g. two distinct sources reference the same fact)
- [ ] `distortion_level` producer — bump on a noise / contradiction event (LLM call or admin flag)
- [ ] `disputed` flag — admin route to flip; UI surface for the flag badge

## Related

- `TASK-world-lore-lifecycle-confidence-decay-distortion` (merged `190a6ea9b`)
- `BUG-lore-decay-gate-is-dead-code-…` (sibling)
- `005_world_lore_lifecycle` migration

## Resolution

Resolved in commit `0da9d9b0` on branch `lore-lifecycle-followup`. The minimal
prompt-side producer was wired in `lore.ts` `applyActivationTracking`: every
included `world_lore_entries` row now has `last_verified = now` set in the same
UPDATE as `last_activated`. The regression test (`writes last_verified on
included world-lore rows (minimal producer)`) confirms both timestamps move
together.

The remaining producers (`source_count`, `distortion_level`, `disputed`) stay
deferred — they require an LLM verifier pass / corroboration engine /
admin UI surface, none of which are in scope for this batch.

