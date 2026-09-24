<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-math-resolver-pbta-2d6 — 2d6 + stat resolution

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium (2 days)
**Summary:** Implement PbtA-style 2d6 + stat resolution as a new dispatch path under `resolveInteraction`. Outcome bands: `full` (≥10), `partial` (7–9), `miss` (≤6).
**Context:** loop-lore's existing resolver is a 5e d20 implementation. The research synthesis (`docs/research/interaction-systems-math.md`) identifies 2d6 partial-success as a high-value model: more nuanced than pass/fail, friendlier to narrative GM play, and pairs naturally with the Position/Effect axes added in `TASK-math-position-effect-columns`. Adds `roll_kind = "2d6"` dispatch under the same `resolveInteraction` surface so prompt + analytics + audit log all see one canonical outcome.
**Acceptance Criteria:** [ ] `resolveInteraction({rollKind: "2d6", stat: 1, difficulty: 0})` returns `Outcome.Full | Partial | Miss`. [ ] `interaction_logs.roll_kind = "2d6"` (new enum column on migration 009 alongside position/effect). [ ] Prompt section renders `rolled: 2d6 +1 → 8 (partial success)`. [ ] Tests: `2d6 +0 = 7..12` → full/partial distribution sanity; stat cap `2d6 +3` reaches `full` ~58% of the time; modifier source table still respected.
**Epic:** epic-math-resolution
**Tags:** rpg, math, dice, 2d6, pbta, resolution

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


git issue: 4268a9d
