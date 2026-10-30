<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Chat owners frontend in chat settings

**Status:** Done
**Status Note:** Shipped 2026-10-30: Owners section in chat-settings modal (list/add/remove/resign with confirm modals), ownership.ts canTransferOwnership keys on the loaded `_owners` set only (admin.chat bypass kept; created_by ignored), owner-cap pre-disable at 3, participant reload on change without page refresh. Verified: frontend settings tests 51 pass / 64 skip / 0 fail; gates frontend-template-preflight, frontend-innerHTML-xss, i18n-reconcile, typecheck-frontend all PASS; i18n 9/9 locales 1915/1915.
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

- [x] Implementation complete — Owners section (list/add/remove/resign) in chat-settings-modal.html; owners.ts actions (loadChatOwners/submitAddOwner/submitRemoveOwner, OWNER_CAP=3 mirror); ownership.ts canTransferOwnership owners-set only; i18n keys added to en + 9 locales.
- [x] Tests passing — ownership-actions.test.ts extended (listed owner true, absent false, co-owner true, stranger false, resigned creator false, not-loaded false); src/frontend/alpine/chat-settings/ 51 pass / 64 skip / 0 fail; template-preflight + innerHTML-xss + i18n-reconcile + typecheck-frontend PASS.
- [x] Documentation updated — modal copy via i18n keys (chat.owners.*); no stale created_by authority claim (predicate doc states created_by confers no authority).
