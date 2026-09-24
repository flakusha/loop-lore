<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-math-resolver-pbta-2d6 — 2d6 + stat resolution

Status: **Draft**
Parent epic: `EPIC-RESEARCH-MATH-RESOLUTION`
Estimated effort: 2 days

## Goal

Implement PbtA-style 2d6 + stat resolution as a new dispatch path under
`resolveInteraction`. Outcome bands: `full` (≥10), `partial` (7–9),
`miss` (≤6). Persist raw dice, kept dice (both), modifier breakdown,
and band.

## Acceptance criteria

- `resolveInteraction({rollKind: "2d6", stat: 1, difficulty: 0})`
  returns `Outcome.Full | Partial | Miss`.
- `interaction_logs.roll_kind = "2d6"` (new enum column on migration
  009 alongside position/effect).
- Prompt section renders
  `rolled: 2d6 +1 → 8 (partial success)`.
- Tests:
  - `2d6 +0 = 7..12` → full/partial distribution sanity.
  - Stat cap: `2d6 +3` reaches `full` ~58% of the time.
  - Modifier source table still respected.

## Out of scope

- 2d6 *move* parsing (PbtA moves are out of scope; this is a roll
  resolver, not a move engine).
- "Choose 2 / choose 1" partial-success options (deferred).
