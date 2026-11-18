<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: moderator-hidden message readable by direct ID in public chats

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-chat-privacy.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Direct message read selects by id with no visibility filter; the public-chat branch admits any authenticated caller. List and export already filter hidden rows, so only the direct/variant reads leak.

**Evidence (dev 2026-11-18):** getMessageWithAccess selects by id with no visibility predicate and returns for authed strangers in public chats (src/chat/service/read.ts:32-36,52-66); route returns the row (src/routes/messages/read.ts:83-90); list/export filter hidden (read.ts:98,111); profanity sets hidden_by_moderator (src/routes/messages/send-message.ts:123-124).

**Scope:** add a visibility predicate to the non-privileged branches of getMessageWithAccess; apply the same filter to /variants and /variant reads; preserve owner/admin/message-author authority from owners-authority.test.ts:127.

**Acceptance Criteria:**

- [ ] hidden message returns 404 for an authenticated stranger in a public chat
- [ ] owner, admin and author still read it
- [ ] variant endpoints omit hidden messages
- [ ] encrypted hidden content never reaches render helpers

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
