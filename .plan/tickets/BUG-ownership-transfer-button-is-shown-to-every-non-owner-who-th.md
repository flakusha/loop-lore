<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Ownership-transfer button is shown to every non-owner, who then eats a 403

**Status:** Done
**Status Note:** [2026-10-28 triage] FIXED — filed against the 2026-10-25 triage snapshot, but the parallel fix `a763847ee` ("fix(frontend): gate the ownership-transfer button on ownership") landed first: `src/frontend/alpine/chat-settings/ownership.ts:144-152` now returns false without an active chat, allows `admin.chat`, and otherwise requires `chat.created_by === globalThis.__USER_ID`, so the button bound at `src/components/chat/chat-settings-modal.html:95` is only shown to the creator or an admin. No further work.
**Priority:** low
**Effort:** Small
**Epic:** epic-chat-product-features
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

The chat settings modal shows the transfer-ownership control to every non-owner.

## Summary

canTransferOwnership() returns !!this.activeChat — it is not gated on ownership at all. Every non-owner therefore sees the transfer-ownership control in the chat settings modal and eats a 403 when they click it.

- src/frontend/alpine/chat-settings/ownership.ts:138-142 — canTransferOwnership(): boolean { return !!this.activeChat; } with the comment // TODO(chat-ownership): gate on created_by/admin instead of !!activeChat
- src/components/chat/chat-settings-modal.html:95 — x-show="canTransferOwnership()" binds it

## Scope

Gate the predicate on actual ownership (creator or admin), using the same source of truth the server uses to authorize the transfer. Do not change the transfer endpoint itself.

The adjacent TASK-chat-feature-ownership-transfer is legitimately Done — its acceptance criteria cover the transfer itself, not the button gate.

## Acceptance Criteria

- [ ] canTransferOwnership() returns true only when the active chat is owned by the current user (or the current user is an admin), resolved from the same ownership source of truth the server uses for the transfer.
- [ ] The TODO(chat-ownership) comment in src/frontend/alpine/chat-settings/ownership.ts is removed once the gate is implemented.
- [ ] A non-owner no longer sees the transfer-ownership control rendered by src/components/chat/chat-settings-modal.html.
- [ ] Tests passing
- [ ] bun run check passes

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
