<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Plugin-contributed MCP tools

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-agentic-integration-mcp-acp
**Tags:** mcp, plugins
**Depends on:** `TASK-mcp-stdio-server-via-typescript-sdk`
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Allow plugins to register MCP tool definitions. Optional, after core.
AMENDMENT B1 applies to plugin tools too: plugin-contributed tools pass through the same per-op authorization (scope + ownership), rate limiting keyed on the API-key principal, and audit rows as core facade ops.
AC: a plugin tool invoked over MCP produces an audit row and honors its declared scope.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] A plugin-contributed tool invoked over MCP produces an audit row and honors its declared scope
- [ ] Same per-op authorization, rate limiting, and audit rows as core facade ops
