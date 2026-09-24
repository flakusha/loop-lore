<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-math-position-effect-columns — Position/Effect on interaction logs

Status: **Draft**
Parent epic: `EPIC-RESEARCH-MATH-RESOLUTION`
Estimated effort: 1 day

## Goal

Add `position` and `effect` enum columns to `interaction_logs` so the
LLM prompt can narrate "controlled miss" vs "desperate miss" without
free-text risk.

## Acceptance criteria

- Migration `009_math_resolution` adds `position` enum
  (`controlled`, `risky`, `desperate`, `null`) and `effect` enum
  (`limited`, `standard`, `great`, `null`).
- `resolveInteraction` accepts optional `position` / `effect`; defaults
  to `risky` / `standard` when `rollKind` is `dice_pool`, `null`
  otherwise.
- Prompt section `interaction-context` renders
  `position: risky; effect: standard` when present.
- Tests: every combination of position/effect appears in prompt
  rendering; null columns are omitted.

## Out of scope

- Position/effect influencing roll math (only narrative envelope in MVP).
- LLM prompt *enforcement* (covered by `TASK-math-structured-llm-dice-result`).
