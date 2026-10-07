<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Message-create 503 passthrough omits persisted id and duplicates user messages on retry

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Evidence (approved finding 3, P2; .tmp/concern-dev-2026-10-07.md, .tmp/concern-auth.md): src/routes/messages/create.ts:240-251 passes the generation 503 through verbatim ({error, code, meta} — no id) although insertUserMessageRow (create.ts:152) already committed the user row before maybeAutoReply (create.ts:229). The 503 body cannot distinguish 'message stored, only the reply failed' from 'nothing stored'. Consumers: src/frontend/alpine/chat-send.ts:121-175 treats the 503 as a failure (removes the optimistic bubble, restores the composer) and src/frontend/fe-fetch.ts:55-64 mints a fresh crypto.randomUUID() Idempotency-Key per retry, so migration-045 coalescing cannot dedupe it — duplicate user row, and the originally-stored message reappears on next loadMessages(). Executed evidence (bun .tmp/repro-fefetch.ts, real feFetch): send key vs retry key differ, fresh key per retry => server cannot coalesce: true. 503 origin: src/routes/messages/reply.ts:196-203 (the only non-2xx reply.response); edge trigger swipe-slot concurrency; before the patch this path answered 201. Fix: include the persisted id in the 503 body ({ id, error, code } — the route's 503 schema is ErrorResponse, tolerant of extra fields) and reload client-side when present; or use a stable idempotency key per composer draft.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
