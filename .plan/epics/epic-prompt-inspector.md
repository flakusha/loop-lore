<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Prompt Inspector — Pre-Send Assembled-Prompt View

**Effort:** Small
**Type:** epic
**Tags:** prompt, inspection, debugging, sillytavern-parity
**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** Medium

## Summary

A read view of the *final assembled prompt* (all lore injections, memory blocks, system sections) before dispatch — the de-facto debugging tool for lore-activation and context-injection issues. Assembly is already a pure function call (`assemblePrompt`, used at `src/assistant/commands/workflow.ts:22,76,146`), so a read-only API route + viewer is cheap; editing pre-send is the expensive later half.

**Coverage discrepancy (promotion note):** the round-2 research doc recorded zero planned coverage via `giwt search "prompt inspector"` / `"prompt preview"` (both no matches, 2026-11-01). Diligence during promotion found an existing ticket the doc's search missed: `TASK-PROMPT-DRY-RUN-INSPECTION` (`81c71d2`, Not Started, under `epic-chat-context-optimization`) — a dry-run endpoint + itemized pre-send prompt viewer with per-block token counts, which **already covers the read-only half of this gap**. No duplicate first ticket was created this round; the epic tracks the remaining delta and coordinates with `81c71d2`.

## Scope

- Read-only assembled-prompt inspection (owned by existing `81c71d2`; do not duplicate).
- Remaining delta: block-addressability matching injection-pipeline keys (traceability), and the pre-send *edit* half (mutating one render before dispatch) — to be ticketed only after `81c71d2` lands and the delta is re-verified.

## Related Epics

- `epic-chat-context-optimization.md` — owner of `81c71d2`.
- `epic-context-injection-correctness.md`, `epic-context-injection-templates.md` — cover *what* gets injected; this epic covers *inspection of the result*.

## Tickets

- (existing, covering read-only inspection) `TASK-PROMPT-DRY-RUN-INSPECTION` (`81c71d2`, Not Started).
- Delta tickets intentionally not filed this round — see promotion note above.

## Open Questions

- Does `81c71d2`'s scope absorb the inspector fully, or should the edit-half become its own ticket after it ships? (Decision deferred to epic start; recorded because the research doc's "zero coverage" claim did not hold.)
