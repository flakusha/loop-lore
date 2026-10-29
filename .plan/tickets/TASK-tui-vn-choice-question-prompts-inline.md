<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: TUI VN choice-question prompts inline

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-visual-novel-mode
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

HarnessReuse Group-2 TUI slice (T6): VN choice/question prompts inline in the transcript.

**Ground state:** Pending VN choices/questions come from `vnChoiceRoutes`/`vnQuestionRoutes` (wired `src/routes/chats/index.ts:62-63`); TUI renders nothing for pending prompts. Distinct from `BUG-chat-vn-choices-idor-*` (access-guard fixes on the same routes, not TUI surface).

**Adopt/adapt/defer:** No external URL for this slice; the numbered-option inline render follows the T5 branch-list numbered-row pattern.

**Acceptance criteria:**

- [ ] Pending VN choice/question renders as numbered options in the transcript.
- [ ] Replying with the option number POSTs the decision.
- [ ] Expired/decided prompts render as plain history (no dead input).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
