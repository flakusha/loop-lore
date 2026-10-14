<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: answerQuestion double-answer race (TOCTOU on status check)

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

answerQuestion (src/rpg/questions/service.ts:196-260) reads the question row, checks status === Open, then updates. Two concurrent answers both pass the status check and both apply effects (quest progress, item grants, system message). Evidence: service.ts:202-212 — read and status check are separate async steps with no transaction. service.ts:218-226 — unconditional UPDATE without AND status = 'open'. Impact: Duplicate quest progress, double item grants, and two system messages for a single question answer. Fix: Change the UPDATE to include .where('status', '=', RpgQuestionStatus.Open) and check numUpdatedRows === 0 to detect a concurrent answer.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
