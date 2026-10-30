<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Chat owners routes and compat transfer endpoint

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-chat-multi-ownership
**Tags:** chat, ownership, routes
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Routes on the chats surface: POST /api/chats/:id/owners (body { userId, confirm: true, reason? }) and DELETE /api/chats/:id/owners/:userId (remove or resign), authority owner-or-admin via the service; the existing POST /api/chats/:id/transfer-ownership keeps its exact HTTP contract (body { newOwnerId, confirm, reason? }, response { ok, chatId, previousOwnerId, newOwnerId, autoInvited }) backed by the re-anchored service. Chat serialization for the settings payload gains an owners list (user ids) so the frontend predicate stops depending on created_by. AC: route tests pin the 401/403/404/400 matrix, last-owner refusal, cap refusal, duplicate refusal; the compat endpoint route tests keep passing unchanged except added owner-set assertions; OpenAPI regenerated for the two new endpoints.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
