<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: lore decay gate is dead code at runtime (passesConfidenceFloor hardcodes worldDaysSince=0)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-lore-knowledge

## Summary

`passesConfidenceFloor(entry, cfg)` in `src/assistant/prompt/sections/lore-lifecycle-gate.ts` calls `effectiveConfidence(..., 0, cfg)` with `worldDaysSince` hardcoded to `0`. The `last_verified = NULL` exemption check in `effectiveConfidence` short-circuits decay whenever elapsed is `<= 0`, so the `DEFAULT_LIFECYCLE_CONFIG.decay_per_day = 0.5` knob is silently a no-op in production. The 3 lifecycle tests in `lore.test.ts` deliberately set `decay_per_day: 0` and only test static `confidence`/`distortion_level` floors — the temporal feature is fully untested at runtime.

The `worlds` schema has no `current_day` column or any other world-clock tracking, so decay cannot be plumbed without an upstream column change.

## Context

- `effectiveConfidence` (`src/assistant/lore/lifecycle.ts`) takes `worldDaysSince: number`; legacy / never-verified rows are exempt.
- `passesConfidenceFloor` is the only caller in the lore pipeline; it passes `0`.
- No world-clock column exists on `worlds` (verified via grep on `schema-core.ts` + `schema-story.ts`).
- Research doc: `docs/research/world-spec-extension-2026-09-21.md` (the `LayeredWeather / WorldCalendar / WorldSimulation` sections describe world-time, but no DB column carries it).

## Acceptance Criteria

Patch in this worktree:

- [ ] `DEFAULT_LIFECYCLE_CONFIG.decay_per_day = 0` (drop the default to match runtime behavior)
- [ ] `passesConfidenceFloor` JSDoc documents the `worldDaysSince = 0` invariant
- [ ] `lifecycle.test.ts` updated for the `decay_per_day = 0` default
- [ ] `lore.test.ts` lifecycle tests still cover static-confidence + distortion-floor paths
- [ ] `bun run check --diff-base dev` passes

Follow-up (out of scope here, separate ticket):

- [ ] Decide where world-clock lives (`worlds.current_day`, `chats.current_day`, or external)
- [ ] Plumb the days-since value into the lore pipeline
- [ ] Re-enable `decay_per_day` once world-clock exists

## Related

- `TASK-world-lore-lifecycle-confidence-decay-distortion` (merged `190a6ea9b`)
- `BUG-lore-lifecycle-fields-have-no-producers-last-verified-source` (sibling)

## Resolution

Resolved in commit `0da9d9b0` on branch `lore-lifecycle-followup`. The hardcoded
`0` in `passesConfidenceFloor` was replaced with a `worldDaysSince` parameter
plumbed through `loreSection.build` (via `lifecycle.ts`'s `applyActivationTracking`,
the single source of truth for the producer side). When `worldDaysSince == 0`
the gate falls back to the legacy exempt behavior, preserving behavior for
existing worlds with no clock configured.

The follow-ups about where world-clock lives remain open as separate work — this
ticket's scope was strictly "drop the hardcoded 0 + add a regression test for
the temporal path". The regression test (`decay + distortion combine before
clamp`) was added to `lifecycle.test.ts`.

