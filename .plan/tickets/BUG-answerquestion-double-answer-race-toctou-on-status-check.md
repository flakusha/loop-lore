<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: answerQuestion double-answer race (TOCTOU on status check)

**Status:** Done
**Status Note:** stale-resolved (verified 2026-10-25) — the answer UPDATE carries `.where("status", "=", RpgQuestionStatus.Open)` (src/rpg/questions/service.ts:236) and throws `not_open` when zero rows are affected (:239-241); a concurrent second answer loses the conditional update before any effects run.
**Priority:** high
**Effort:** Medium
**Epic:** epic-rpg-mechanics

**Summary:**

answerQuestion (src/rpg/questions/service.ts:196-260) reads the question row, checks status === Open, then updates. Two concurrent answers both pass the status check and both apply effects (quest progress, item grants, system message). Evidence: service.ts:202-212 — read and status check are separate async steps with no transaction. service.ts:218-226 — unconditional UPDATE without AND status = 'open'. Impact: Duplicate quest progress, double item grants, and two system messages for a single question answer. Fix: Change the UPDATE to include .where('status', '=', RpgQuestionStatus.Open) and check numUpdatedRows === 0 to detect a concurrent answer.

**Context:**

Closure rationale (verified 2026-10-25 against the current implementation): the answer UPDATE carries `.where("status", "=", RpgQuestionStatus.Open)` (src/rpg/questions/service.ts:236) and throws `not_open` when zero rows are affected (:239-241); a concurrent second answer loses the conditional update before any effects run.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue fc864ee (registry tip: be1450956 Konstantin Fedotov Close issue)
