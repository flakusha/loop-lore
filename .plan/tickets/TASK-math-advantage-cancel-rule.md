<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-math-advantage-cancel-rule — Enforce 5e-style advantage cancel

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small (½ day)
**Summary:** Enforce the canonical D&D 5e rule that advantage and disadvantage cancel to plain when both are present.
**Context:** Today `resolveInteraction` honors each modifier in isolation — when both an advantage source and a disadvantage source appear, the system leaves them stacking (effectively "net advantage" rather than the canonical "cancel to normal" rule). The interaction-context prompt can then surface a contradictory modifier breakdown. The cancel rule belongs in the resolver so every consumer (prompt, analytics, audit log) reads a consistent outcome.
**Acceptance Criteria:** [ ] `resolveInteraction` reduces `advantage` flag to `normal` when the modifier list contains at least one advantage source and at least one disadvantage source. [ ] The reduction is recorded in `interaction_logs.modifiers` JSON with a marker `{source: "system.cancel", value: 0}` (or equivalent). [ ] Tests cover: `[advantage]` → advantage; `[disadvantage]` → disadvantage; `[advantage, disadvantage]` → normal; `[advantage, advantage, disadvantage]` → normal; `[advantage, advantage]` → advantage.
**Epic:** epic-math-resolution
**Tags:** rpg, math, dice, advantage, modifier, resolution

Enforce the canonical D&D 5e rule: advantage and disadvantage do not
stack. If any source grants advantage and any source grants disadvantage,
the roll is plain.

## Acceptance criteria

- `resolveInteraction` reduces `advantage` flag to `normal` when the
  modifier list contains at least one advantage source and at least one
  disadvantage source.
- The reduction is recorded in `interaction_logs.modifiers` JSON with a
  marker `{source: "system.cancel", value: 0}` (or equivalent) so the
  prompt can surface "advantages cancelled".
- Tests:
  - `[advantage]` → advantage.
  - `[disadvantage]` → disadvantage.
  - `[advantage, disadvantage]` → normal.
  - `[advantage, advantage, disadvantage]` → normal.
  - `[advantage, advantage]` → advantage.

## Out of scope

- Modifier *source* normalization (covered by `TASK-math-modifier-source-table`).
- 2d6 / dice pool cancellation (Blades/PbtA have no such rule).


git issue: 0820515
