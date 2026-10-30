<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Harness context op events

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-harness-integration
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Context add/remove/compact/rotate as first-class event records on the existing message chain (pi non-message session entries pattern). Only the records are new: compaction machinery exists (ContextCompactor at src/generation/generate-route/build-prompt.ts:99-103 and src/assistant/prompt-budget.ts:31-39), pruning at src/chat/pruning/prune.ts; the LLM-context projection stays separable because prompt assembly reads messages, not all rows. Cross-link: epic-chat-context-optimization.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
