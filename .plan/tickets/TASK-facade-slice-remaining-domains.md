<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Facade slice: remaining domains

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-agentic-integration-mcp-acp
**Tags:** mcp, facade
**Depends on:** `TASK-facade-slice-chat-and-generation-ops`
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Second facade slice (amendment B5): assets (search/attach/generate), characters/personas (list/get/update), memory (recall/store/purge), rpg (quests/inventory/combat) onto the same op registry.
AC: identical per-op authorization (scope + ownership), rate limiting keyed on the API-key principal, audit rows per call, and schema imports from src/validation/schemas as the chat+generation slice.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Identical per-op authorization (scope + ownership) as the chat+generation slice
- [ ] Rate limiting keyed on the API-key principal
- [ ] Audit rows per call
- [ ] Schema imports from src/validation/schemas
