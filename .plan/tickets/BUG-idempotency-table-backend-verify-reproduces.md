<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: idempotency table backend — verify reproducer or close (advisory orphan)

**Status:** Done
**Priority:** medium
**Effort:** Trivial
**Type:** Bug
**Summary:** Advisory orphan `e12566a` (idempotency-table-backend) reported by `bun run plan:sync` 2026-09-10. Bucket A landed the table backend as the default; the original ticket must be reproduced against current code, otherwise closed as stale.
**Context:** `.plan/backlog/open-untriaged.md` § 2026-09-10 re-triage flags this advisory orphan with the explicit instruction: reproduce before linking; the backlog says the table backend is now the default, so close if the defect no longer exists. Bucket A shipped the idempotency user-scope fix (c1cd4d8b); the table backend landed as part of that wave. No further symptoms have been reported since the gate turned green.

## Repro / Current state

1. Read src/middleware/idempotency.ts and verify the active backend is the table-backed store (not the in-memory map).
2. Run the existing idempotency suite (bun test src/middleware/idempotency*).
3. If the table backend is the default AND no test fails AND no caller path bypasses the cache key user-scope, the original defect is resolved.
4. Otherwise, capture a minimal repro (two distinct users hitting the same idempotency key must get distinct cache entries) and re-open a BUG ticket against the regression.

**Acceptance Criteria:**

- [ ] src/middleware/idempotency.ts confirms table backend is active (no in-memory fallback in production).
- [ ] Idempotency suite green; cross-user isolation test still passing.
- [ ] Either: (a) ticket closed with a pointer to the verification log + commit hash, OR (b) minimal repro captured and a fresh BUG ticket filed with a clear regression pointer.
- [ ] plan:sync:fix run after closure so the advisory orphan no longer appears.

**Tags:** idempotency, middleware, advisory-orphan, untriaged
**Related:** src/middleware/idempotency.ts, .plan/backlog/open-untriaged.md § 2026-09-10 re-triage


git issue: 4ddc410
