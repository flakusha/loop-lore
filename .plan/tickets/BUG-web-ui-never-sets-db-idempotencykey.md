<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Web UI never sets DB idempotencyKey

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-middleware-request-lifecycle

**Resolution:** `chat-send.ts` — one `crypto.randomUUID()` per send, shared by header (`idempotencyKey` string) + body (`body.idempotencyKey`); header 10s cache and DB unique index now coalesce the same turn. Server already accepted body key (`create.ts:76`).
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Web UI mints a fresh UUID per call (fe-fetch.ts:55-56) for the header cache only; body.idempotencyKey (create.ts:76, unique index migration 045) is never set by the Web UI — only scheduled/dispatcher.ts:146 and the merge service use it. Double-sends are never coalesced at the DB layer. Evidence: .tmp/interaction-cycles.md ## Chat turn. Epic: epic-interaction-surfaces-audit.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**
- [ ] Implementation complete

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-24 registry-driven close: git issue edd643b (registry tip: 91fca6bf8 Konstantin Fedotov Auto-closed: appended .md marker marks BUG-WEB-UI-NEVER-SETS-DB-IDEMPOT)
