<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: TUI blind to LLM assistant turns

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

TUI reads only data.assistantMessage (src/tui/chat/api.ts:82). With LLM configured, reply.ts:91-107 fires triggerAutoGeneration detached and returns 201 {id,context} WITHOUT assistantMessage; the reply arrives over SSE, which the TUI has no client for. Assistant turn invisible until F5 (src/tui/app-keys.ts:156). Evidence: tree/interaction-surfaces-audit/.tmp/interaction-cycles.md ## Chat turn. Epic: epic-interaction-surfaces-audit.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
