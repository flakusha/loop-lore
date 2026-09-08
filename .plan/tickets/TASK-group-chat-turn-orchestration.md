<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Group Chat Turn Orchestration

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-group-chat
**Related:** BUG-group-chat-talkativity-not-surfaced-in-prompt, BUG-group-chat-silence-pass-not-implemented, TASK-turn-send-gate, TASK-vn-choice-opt-in, TASK-narration-levels, TASK-turn-skip-event-and-persistence, TASK-turn-skip-gm-absence-contract, TASK-turn-skip-cascade-integration, TASK-turn-skip-gate-interlock, TASK-turn-skip-composer-ui
**git issue:** 6af81fc

## Summary

Wire talkativity weighting and silence-pass into the turn selector so multi-character
groups generate naturally instead of stalling or over-speaking.

## Context

`turn-selector.ts` exposes talkativity-weighted selection and a silence-pass hook,
but `BUG-group-chat-talkativity-not-surfaced-in-prompt` shows the weight is never
injected into the generation prompt, and `BUG-group-chat-silence-pass-not-implemented`
shows the silence-pass branch is a no-op. Groups currently either spam or stall.
Feature code existed without an owning epic/task until now.

## Resolved

- [x] BUG-group-chat-talkativity-not-surfaced-in-prompt — resolved via 359a3d3, group-talkativity prompt section
- [x] BUG-group-chat-silence-pass-not-implemented — resolved in batch-9, pass-filter.ts

Remaining open scope (talkativity wiring, verbosity design) stays in Acceptance Criteria below.

## Related tasks

- TASK-turn-send-gate — send gating on the turn flow
- TASK-vn-choice-opt-in — choice opt-in intersecting turn flow
- TASK-narration-levels — narration and verbosity design
- TASK-turn-skip-event-and-persistence, TASK-turn-skip-gm-absence-contract, TASK-turn-skip-cascade-integration, TASK-turn-skip-gate-interlock, TASK-turn-skip-composer-ui — turn-skip siblings

## Acceptance Criteria

- [ ] Talkativity weight is surfaced to the model/prompt assembly
- [ ] Silence-pass implemented (no actor selected → explicit handling, not a stall)
- [ ] Context-mention boost verified
- [ ] Both linked bugs closed
- [ ] `bun run check` green
