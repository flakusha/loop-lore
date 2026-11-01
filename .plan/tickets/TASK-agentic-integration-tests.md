<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Agentic integration tests

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-agentic-integration-mcp-acp
**Tags:** mcp, acp, testing
**Depends on:** `TASK-mcp-tool-set-v1-from-facade-registry`, `TASK-acp-stdio-server-over-existing-chat-sessions`
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

External client drives a chat turn through MCP and ACP; asserts auth scopes enforced (read-only key cannot write) and that per-op ownership/rate-limit/audit checks fire (amendment B1).
Parallel-safe resource contract (amendment B7): one server child + pipe pair per test killed in afterEach, port 0 for HTTP, per-test :memory: DB, documented resource-contract comments (repo precedent: fake-acp-server.ts:12-15).
AC: both MCP and ACP paths covered; unauthorized ops denied with 403-class results.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Both MCP and ACP paths covered
- [ ] Unauthorized ops denied with 403-class results
- [ ] Auth scopes enforced (read-only key cannot write); per-op ownership/rate-limit/audit checks fire
