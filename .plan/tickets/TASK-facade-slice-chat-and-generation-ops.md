<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Facade slice: chat and generation ops

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-agentic-integration-mcp-acp
**Tags:** mcp, facade, authorization
**Depends on:** `TASK-principal-kind-model-and-server-side-resolution`
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

First facade slice (amendment B5): op registry in src/integrations/loop-lore-facade.ts for chat (send/list/history/export) and generation (trigger/regenerate/continue). AMENDMENT B1 (BLOCKING fix): each op carries scope + ownership checks per op, governance-equivalent rate limiting keyed on the API-key principal (stdio has no userId), and an audit row per facade call — access control is ROUTE-level in loop-lore (src/plugins/types.ts:164-168) and a guard-skipping facade would bypass every guard. Facade ops import the SAME typebox schemas from src/validation/schemas (never re-implement).
AMENDMENT B8: each registry entry carries summary/description metadata + typebox schemas + scope metadata so the capabilities manifest, MCP tools/list, and docs all generate from it (single source of truth). AC: read-only key cannot invoke write ops; audit row exists per call.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Each op carries scope + ownership checks; read-only key cannot invoke write ops
- [ ] Governance-equivalent rate limiting keyed on the API-key principal
- [ ] Audit row exists per facade call
- [ ] Facade ops import the SAME typebox schemas from src/validation/schemas (never re-implement)
- [ ] Registry entries carry summary/description + typebox schemas + scope metadata (single source of truth)
