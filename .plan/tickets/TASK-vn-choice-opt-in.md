<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: VN choice opt-in with pending-choice send block

**Summary:** Make VN choices opt-in per chat and make a pending choice block
the send button until it is resolved or dismissed.
**Context:** Choices today are unconditional and the turn send gate has no idea
choices exist. See `## Summary` for the intent; the five boxes in
`## Acceptance Criteria` are the deliverable.
**Acceptance Criteria:** The five boxes in `## Acceptance Criteria`.


**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Tags:** visual-novel, choices, opt-in, send-gate
**Epic:** epic-visual-novel-mode
**Git Issue:** ce429a2

**Related:** `TASK-vn-branching-choices.md` (choice generation + the send path
this gate must intercept), `TASK-visual-novel-mode.md` (where a per-chat VN
flag would be persisted).

## Summary

VN branching choices exist (POST /api/chats/:id/vn/generate-choices, vn_choices table, choice-cards.ts) but are always-on: no opt-in flag, and send is never blocked by pending choices. Add per-chat opt-in for VN decision elements (ask-tool-like decision making, choice selection); while a choice is pending, the turn send gate blocks free-text send until the choice is resolved or dismissed; resolving a choice consumes the beat (records impacts/next scene, releases the slot).

## Acceptance Criteria

- [ ] Per-chat opt-in flag for VN choice elements (default off)
- [ ] Pending choice blocks free send via the turn send gate until resolved/dismissed
- [ ] Choice resolution consumes the beat and applies consequences/next scene
- [ ] Opt-out chat never shows choice UI and never blocks on choices
- [ ] Tests passing
