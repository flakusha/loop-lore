<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# IDEA: IDEA prompt-improve undo history: multi-level undo stack for composer

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Small
**Tags:** idea, frontend
**Context:** Composer prompt-improve keeps a single _promptImproveBackup; a second Improve discards the original draft (src/frontend/alpine/chat-actions/prompt-improve.ts).

## Summary

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# IDEA: Prompt-improve multi-level undo history

**Status:** draft
**Priority:** P3
**Effort:** Small
**Summary:** The composer keeps only one `_promptImproveBackup`, so a second Improve discards the original draft forever. Keep a small bounded stack instead.
**Acceptance Criteria:** (see below)
**Tags:** idea, frontend, prompt-improve
**Related:** src/frontend/alpine/chat-actions/prompt-improve.ts:113 (`_promptImproveBackup`), TASK-prompt-improve-composer-ui

## Summary

`improvePrompt` overwrites `_promptImproveBackup` on every run
(`prompt-improve.ts:78,113`): Improve → Improve → Undo returns the
*first improved* text, not the user's original. Users iterating through
levels (wording → expand → creative) cannot walk back more than one step.

## Acceptance Criteria

- [ ] `_promptImproveBackup: string | undefined` becomes a bounded stack (e.g. last 5 drafts) with Undo popping one level
- [ ] Undo button label/step count reflects remaining depth; empty stack hides the affordance
- [ ] Existing single-undo tests (`prompt-improve-local.test.ts`) still pass; one new test covers Improve×2 → Undo×2 restores original
- [ ] No new server surface; purely client-side state in `promptImproveActions`

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
