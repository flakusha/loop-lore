<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-math-structured-llm-dice-result — Typed DiceResult contract

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium (1 day)
**Summary:** Emit a typed `DiceResult` JSON for the LLM and force the assistant response to include the contract verbatim, not a free-form re-narration.
**Context:** Today the LLM often narrates outcomes that disagree with the recorded roll (`roll.raw_total=1` narrated as success, `roll.raw_total=20` narrated as a non-critical success). The ledger has the truth; the prompt does not enforce it. A typed `DiceResult` contract that the prompt section renders verbatim (and that the assistant response must echo) closes the contradiction.
**Acceptance Criteria:** [ ] `src/rpg/interaction/contract/dice-result.ts` exports `DiceResult`: `sides`, `count`, `kept`, `rawTotal`, `total`, `modifiers`, `advantage`, `outcome`, `position?`, `effect?`, `naturalCrit?`. [ ] `interaction-context` prompt section renders `DiceResult` as a structured JSON block before the narrative. [ ] Assistant command handler returns the `DiceResult` to the LLM via the response payload, not via natural-language echo. [ ] Regression test asserts the prompt contains `naturalCrit: 20` when the recorded `roll.raw_total` is 20, regardless of LLM narration.
**Epic:** epic-math-ai-bridge
**Tags:** rpg, math, llm, contract, dice-result, ai-bridge

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


git issue: 587f716
