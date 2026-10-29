<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: account export portability bundle (versioned ZIP + round-trip)

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-security-sandboxing
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Compliance export proposal 2. GET /api/users/me/export versioned ZIP (JSON + markdown via formatMarkdown + asset manifest sha256Hex); consent receipts (after ledger ticket) + key inventory (ids/algos/dates, never plaintext); account-export audit row; streamed/bounded. Self-only + admin-with-audit; per-table filters server-side (deleted_at IS NULL for moderation); key inventory metadata-only; token scope export verified.

Owner: epic-security-sandboxing.md (Not Started). Verified: chat format.ts:30 + export-route.ts:96-133; moderation exportUserData + log_entries export-user-data (data.test.ts:211-316); no exportUserDataFull (comment data.ts:49-50 only).

Acceptance: fresh-instance import round-trips; soft-deleted rows excluded; account-export audit row; streamed/bounded memory; per-test user/export job, unique tmp per test with finally unlink; negative tests: no key plaintext, soft-deleted excluded.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
