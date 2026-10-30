<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Chat owners frontend in chat settings

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-chat-multi-ownership
**Tags:** chat, ownership, frontend
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Chat-settings modal surfaces (src/components/chat/chat-settings-modal.html:888+, src/frontend/alpine/chat-settings/ownership.ts): an Owners management section — list current owners, add an owner via the existing participant picker, remove an owner or resign with the confirm-modal pattern; canTransferOwnership consults the payload owners array instead of chat.created_by === globalThis __USER_ID (admin.chat bypass kept). i18n keys reconciled via bun run i18n:check. AC: ownership-actions tests extended for add/remove actions and the co-owner predicate (second owner true, stranger false); frontend template preflight and innerHTML XSS gates green; participant list reload without full page refresh on owner changes.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
