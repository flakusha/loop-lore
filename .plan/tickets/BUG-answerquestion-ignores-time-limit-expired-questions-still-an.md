<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: answerQuestion ignores time_limit (expired questions still answerable)

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-rpg-mechanics

**Summary:**

The rpg_questions row has a time_limit column (stored at src/rpg/questions/service.ts:144, returned at service.ts:57), but answerQuestion never checks it. The docstring at service.ts:191 claims not_open is thrown for expired questions but the code only checks status. Impact: Questions with a time limit remain answerable indefinitely, breaking time-sensitive gameplay. Fix: Add if (row.time_limit !== null && row.time_limit <= new Date().toISOString()) throw new QuestionError(..., 'not_open') before the status check.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
