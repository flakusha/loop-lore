<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-math-advantage-cancel-rule — Enforce 5e-style advantage cancel

Status: **Draft**
Parent epic: `EPIC-RESEARCH-MATH-RESOLUTION`
Estimated effort: ½ day

## Goal

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
