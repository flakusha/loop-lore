<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Capability manifest and generated docs

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-agentic-integration-mcp-acp
**Tags:** mcp, docs
**Depends on:** `TASK-mcp-tool-set-v1-from-facade-registry`, `TASK-acp-stdio-server-over-existing-chat-sessions`
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

AMENDMENT B8 (derive, don't hand-maintain): the /api/v1/capabilities manifest, the MCP tools/list payload, and the docs tool table all GENERATE from the one facade op registry (typebox schemas + scope + per-op summary/description metadata), reusing the existing OpenAPI/VitePress pipeline. Per-op metadata is the named prerequisite (landed with the facade slices); the docs wiring itself is a proposal — owner may decline, the single-source requirement stands. Versioning policy derived from the same registry.
AC: manifest/tools-list/docs cannot drift from the registry; generated pages carry per-op descriptions.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Manifest, tools/list, and docs table all GENERATE from the facade op registry (cannot drift)
- [ ] Generated pages carry per-op descriptions; versioning policy derived from the same registry
