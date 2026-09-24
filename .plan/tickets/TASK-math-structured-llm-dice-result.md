<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-math-structured-llm-dice-result — Typed DiceResult contract

Status: **Draft**
Parent epic: `EPIC-RESEARCH-MATH-AI-BRIDGE`
Estimated effort: 1 day

## Goal

Emit a typed `DiceResult` JSON for the LLM and force the assistant
response to include the contract verbatim, not a free-form re-narration.

## Acceptance criteria

- `src/rpg/interaction/contract/dice-result.ts` exports `DiceResult`:
  `sides`, `count`, `kept`, `rawTotal`, `total`, `modifiers`,
  `advantage`, `outcome`, `position?`, `effect?`, `naturalCrit?`.
- `interaction-context` prompt section renders `DiceResult` as a
  structured JSON block before the narrative.
- Assistant command handler returns the `DiceResult` to the LLM via
  the response payload, not via natural-language echo.
- A regression test asserts the prompt contains `naturalCrit: 20` when
  the recorded `roll.raw_total` is 20, regardless of LLM narration.

## Out of scope

- LLM fine-tuning or system-prompt rewrites that enforce compliance.
- Streaming the `DiceResult` to the TUI (a future TUI feature).
