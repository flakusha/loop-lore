<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Group Chat Turn Orchestration

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-group-chat
**Related:** BUG-group-chat-talkativity-not-surfaced-in-prompt, BUG-group-chat-silence-pass-not-implemented
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

## Acceptance Criteria

- [ ] Talkativity weight is surfaced to the model/prompt assembly
- [ ] Silence-pass implemented (no actor selected → explicit handling, not a stall)
- [ ] Context-mention boost verified
- [ ] Both linked bugs closed
- [ ] `bun run check` green
