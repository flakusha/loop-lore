<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# IDEA: IDEA prompt-improve undo history: multi-level undo stack for composer

**Status:** Done
**Priority:** low
**Effort:** Small
**Epic:** epic-prompt-improvement.md
**Tags:** prompt-improvement
**Tags:** idea, frontend
**Context:** Composer prompt-improve kept a single `_promptImproveBackup`; a second Improve discarded the original draft. Replaced with a bounded 5-level `_promptImproveHistory` stack (src/frontend/alpine/chat-actions/prompt-improve.ts).

## Summary

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# IDEA: Prompt-improve multi-level undo history

**Status:** Done
**Priority:** P3
**Effort:** Small
**Summary:** The composer kept only one `_promptImproveBackup`, so a second Improve discarded the original draft forever. Shipped as a bounded 5-level `_promptImproveHistory` stack.
**Acceptance Criteria:** (see below)
**Tags:** idea, frontend, prompt-improve
**Related:** src/frontend/alpine/chat-actions/prompt-improve.ts (`_promptImproveHistory`), TASK-prompt-improve-composer-ui

## Summary

`improvePrompt` overwrote a single backup on every run: Improve → Improve →
Undo returned the *first improved* text, not the user's original. Users
iterating through levels (wording → expand → creative) could not walk back more
than one step. Now every improve pushes onto `_promptImproveHistory` (capped at
5) and Undo pops one level; the menu entry shows the remaining step count and
hides itself when the stack is empty.

## Acceptance Criteria

- [x] `_promptImproveBackup: string | undefined` becomes a bounded stack (e.g. last 5 drafts) with Undo popping one level
- [x] Undo button label/step count reflects remaining depth; empty stack hides the affordance
- [x] Existing single-undo tests (`prompt-improve-local.test.ts`) still pass; one new test covers Improve×2 → Undo×2 restores original
- [x] No new server surface; purely client-side state in `promptImproveActions`

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
