<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: MCP tool set v1 from facade registry

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-agentic-integration-mcp-acp
**Tags:** mcp, tools
**Depends on:** `TASK-mcp-stdio-server-via-typescript-sdk`
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Implement the v1 tool set from the facade op registry: chat + generation first (slice, amendment B5), then assets/characters/memory/rpg via the remaining-domains facade slice. Input/output schemas ARE the facade registry's typebox schemas (single source of truth, amendment B8). Tool names stable — add new tools rather than rename; deprecate via the manifest.
AC: each tool calls a facade op (no direct service/route coupling); schemas match the registry exactly.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Each tool calls a facade op (no direct service/route coupling)
- [ ] Input/output schemas ARE the facade registry's typebox schemas (single source of truth)
- [ ] Tool names stable — add new tools rather than rename; deprecate via the manifest
