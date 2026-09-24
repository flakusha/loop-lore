<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-math-modifier-source-table — Normalize modifier breakdown

Status: **Draft**
Parent epic: `EPIC-RESEARCH-MATH-RESOLUTION`
Estimated effort: 1 day

## Goal

Replace the `interaction_logs.modifiers` JSON column with a structured
`interaction_modifiers` table that has FKs to a `modifier_sources` enum,
so the LLM prompt section and analytics can reference modifier
provenance row-by-row.

## Acceptance criteria

- New `interaction_modifiers` table with columns:
  `id`, `interaction_log_id` (FK), `source` (FK enum), `value` (numeric),
  `applies_to` (`dc_modifier`, `roll_modifier`, `advantage`),
  `created_at`.
- `modifier_sources` enum: `ability.cha`, `ability.int`, …, `equipment`,
  `cover`, `status`, `spell`, `class_feature`, `circumstance`, `other`.
- `interaction_logs.modifiers` JSON is read for back-compat (legacy rows);
  new rows write to the new table.
- Prompt section `interaction-context` reads from the new table and
  renders `source: value` lines (already does; switch the source).
- Tests: ability cha→ +2, ability int→ +4, equipment→ +2, cover→ +1,
  spell→ +3; sums to recorded modifier.

## Out of scope

- Generic formula AST (covered by `TASK-math-roll-formula-ast`).
- RollKind dispatch (covered by `TASK-math-resolver-pbta-2d6`).
