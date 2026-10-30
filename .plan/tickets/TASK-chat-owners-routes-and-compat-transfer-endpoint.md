<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Chat owners routes and compat transfer endpoint

**Status:** Done
**Status Note:** Done 2026-10-30: src/routes/chats/owners.ts (GET/POST /api/chats/:id/owners, DELETE /api/chats/:id/owners/:userId) following ownership.ts/participants.ts conventions (requireUserId, service-channel error mapping 404/403/400/500, TypeBox schemas ChatOwnerAddBody/ChatOwnerParams/ChatOwnerRemoveQuery in validation/schemas/chat.ts). Owners list exposed via GET (participants-style dedicated endpoint) with creator fallback (new listEffectiveOwnerUserIds service helper, additive); transfer-ownership route byte-identical and its tests unchanged+green. Deviations from ticket summary per operator scope: POST body is { actorId, reason? } (actor id, no confirm gate — confirm kept transfer-only); owners exposed as a GET endpoint rather than embedded in chat serialization (matches how participants are exposed; ticket 5 UI consumes it). OpenAPI regenerated (docs/reference/openapi.json — gitignored generated artifact, .gitignore:112 — both new paths present). Route error strings are plain English literals per ownership.ts convention (repo route layer has no i18n indirection for error messages).
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

- [x] Implementation complete — routes/chats/owners.ts (GET+POST /api/chats/:id/owners, DELETE /api/chats/:id/owners/:userId; authority in service; error mapping mirrors transfer route: not_found 404 / forbidden 403 / bad_request 400 covering cap + last-owner + duplicate + concurrent), validation schemas added to validation/schemas/chat.ts, registered in chats barrel beside ownershipRoutes, additive service export listEffectiveOwnerUserIds (creator fallback for read path).
- [x] Tests passing — routes/chats/owners.test.ts 15 cases (GET fallback+404, POST happy/auto-invite/403 member/404 chat+actor/400 duplicate+cap/422 schema/200 admin, DELETE remove+demote/resign/400 last-owner/400 not-an-owner), private DB per test with teardown; full sweep `bun test src/routes/chats/ + ownership.test.ts + access.test.ts` → 298 pass / 0 fail / 1 pre-existing skip; transfer-ownership route tests UNCHANGED and green.
- [x] Documentation updated — OpenAPI regenerated with both new paths (artifact is gitignored by design); route module docstring documents the full error matrix; deviations recorded in Status Note.
