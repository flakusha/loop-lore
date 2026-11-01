<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Streamable HTTP MCP transport behind central guard

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-agentic-integration-mcp-acp
**Tags:** mcp, http, security
**Depends on:** `TASK-mcp-stdio-server-via-typescript-sdk`, `TASK-api-key-auth-middleware-for-external-agents`
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

AMENDMENT B4 (renamed from 'HTTP/SSE MCP transport' — HTTP+SSE is deprecated since MCP 2025-03-26): mount the Streamable HTTP MCP transport (spec 2025-03-26+) in elysia-app, gated by capability scope. Optional; for remote clients.
AC: HTTP transport requests are AUTH-GATED and enter through the central guard as a NEW ALLOWLIST ENTRY (never a bypass) with governance predicates applied and a principal carried in ctx (amendment B6); OAuth 2.1 noted for remote deployments.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] HTTP transport requests are AUTH-GATED and enter the central guard as a NEW ALLOWLIST ENTRY (never a bypass)
- [ ] Governance predicates applied with a principal carried in ctx
