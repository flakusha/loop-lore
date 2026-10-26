<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: chat-pins cross-chat content leak: pin any message id into your own chat

**Status:** Done
**Status Note:** [2026-10-26 sweep-A verify] FIXED (issue 2d5152c): src/routes/chat-pins.ts:101-117 resolves the message via resolveMessageAccess and rejects when messageChatId !== chatId; GET adds chat_id scoping (:61-63); unpin is pinId+chat_id scoped with owner check (:185-195).
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

chat-pins allows pinning any message id into your own chat and reading its body back — cross-chat content leak (probe-confirmed).

**Files:**

- src/routes/chat-pins.ts:91-114 (POST pins `body.messageId` with no check that the message belongs to `chatId`)
- src/routes/chat-pins.ts:45-60 (GET joins `messages.content` back out)
- src/routes/chat-pins.ts:147-151, 163-168 (unpin fetches the pin by `pinId` without scoping `chat_id`; pinner/owner/admin check evaluates against the URL's chat, not the pin's chat)

**Evidence:**

- Probe `scratch/probe-pins.ts` against real route + real DB: alice (non-participant of bob's chat) POSTs bob's message id into her own chat: `PIN ... 200 {"ok":true,...}`; `LIST pins in alice's chat: 200 {"data":[{...,"content":"BOB-SECRET-CONTENT",...}]}`; `LEAK: true` (review-surfaces.md S-1).
- GET inner-joins `messages` on `chat_pins.message_id` only — `messages.chat_id` is never compared to the pinned chat.

**Fix:**

On POST, resolve the message and require `message.chat_id === chatId` (reuse `resolveMessageAccess`, src/chat/service/polls.ts:152-175); scope the unpin lookup by `pinId` AND `chat_id`.

**Review:** .tmp/reviews/2026-10-25/ (2026-10-25 round) — review-surfaces.md S-1.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 2d5152c (registry tip: 19bd1dc62 Konstantin Fedotov Close issue)
