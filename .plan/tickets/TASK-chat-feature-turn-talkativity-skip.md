<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Turn Management, Talkativity, Skip Turns

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done (2026-10-01)
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-chat-product-features

## Summary

Provide a coherent turn-management surface covering who-speaks-next, per-actor talkativity weighting, and the ability for participants (or the GM) to skip a turn without derailing the active selection state.

## Acceptance Criteria

- [x] Turn selection picks the next speaker deterministically per active strategy
- [x] Talkativity weights shift probabilities without breaking deterministic replay
- [x] Skip-turn action consumes the current slot and advances to the next eligible actor
- [x] Skipped actors get a short cooldown before re-eligibility to prevent immediate re-selection
- [x] GM-forced overrides are auditable via `src/turning/turn-manager/state.ts` transitions
- [x] `src/group-chat/turn-selector.ts` honours the same skip semantics as the per-chat manager


## Verification (2026-10-01)

- **AC1/AC2** — talkativity resolver (`src/turning/talkativity.ts`, shipped earlier) +
  deterministic strategy tests: `src/turning/turn-strategies.test.ts` "deterministic
  replay + talkativity weighting" pins that zeroed weights do not perturb strategy
  selection and replay is stable.
- **AC3** — skip advances through `turn-skip.ts` UI + `src/chat/service/crud/turn-skip.ts`
  persisting `turn_skip` rows (the row feed is what AC4 scans); consecutive-guard
  behaviour covered in the turn-skip service tests.
- **AC4** — `src/turning/skip-cooldown.ts` (commit db080481a): bounded newest-first scan
  of `turn_skip` rows, activity-voiding, cross-chat isolation, all-cooling fallback;
  wired into `turn-manager/participants.ts` + `selection.ts`. Tests:
  `src/turning/skip-cooldown.test.ts` (cooldown window, mixed timestamp formats,
  activity voiding, cross-chat isolation).
- **AC5** — GM-forced skips record `actor/byUser/mode/at` into
  `story_state.forcedSkips` (`src/chat/service/crud/turn-skip-forced.ts`, surfaced via
  `turn-skip-routes.ts` + validation schema); member force-skip of others → 403.
  Tests: `src/chat/service/crud/turn-skip.test.ts` (forced-skip authority + audit trail).
- **AC6** — `src/group-chat/turn-selector.ts` excludes cooling actors from @mention
  eligibility and falls through to the TurnManager path (same filter the manager uses).
  Tests: `src/group-chat/turn-selector.test.ts` "skip cooldown + mute parity".
- Tests run 2026-10-01: `bun test --parallel=4 --isolate src/turning/
  src/group-chat/turn-selector.test.ts …` → 96 pass / 0 fail (9 files, includes
  call-llm, mute-gate, message-actions from the same batch).

## Related Tickets / Epics

- epic-chat-product-features
- epic-actor-turn-skip
- TASK-rpg-check-chat-command-with-modifier-breakdown
- TASK-rpg-gate-chat-commands-behind-world-opt-in

## Files

- `src/turning/turn-manager/selection.ts`
- `src/turning/turn-manager/participants.ts`
- `src/turning/turn-strategies.ts`
- `src/group-chat/turn-selector.ts`
- `src/group-chat/index.ts`

## Open Questions

- Should skip-turn be reversible (undo within a window)?
- Talkativity lives where — per-actor profile, per-chat setting, or both?
- Candidate strategy set (SillyTavern group-reply precedent, 2026-09-11 research): manual, natural order, list order, pooled order — which of these ship first, and do any map onto the existing battle-mode arbitration?
