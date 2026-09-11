<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Turn Management, Talkativity, Skip Turns

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-chat-product-features

## Summary

Provide a coherent turn-management surface covering who-speaks-next, per-actor talkativity weighting, and the ability for participants (or the GM) to skip a turn without derailing the active selection state.

## Acceptance Criteria

- [ ] Turn selection picks the next speaker deterministically per active strategy
- [ ] Talkativity weights shift probabilities without breaking deterministic replay
- [ ] Skip-turn action consumes the current slot and advances to the next eligible actor
- [ ] Skipped actors get a short cooldown before re-eligibility to prevent immediate re-selection
- [ ] GM-forced overrides are auditable via `src/turning/turn-manager/state.ts` transitions
- [ ] `src/group-chat/turn-selector.ts` honours the same skip semantics as the per-chat manager

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

