<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->
# TASK: harness ledger surfacing user side recursive self improvement

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)
**Effort:** (none captured)

**Status:** Done
**Status Note:** 2026-11-25 reconcile: the ledger read route and its admin surfacing shipped — `src/routes/harness/ledger.ts:5-15` (`GET /api/v1/harness/ledger`, admin-gated, 503 when the runtime is not composed) and the admin panel fetch (`src/frontend/alpine/admin-harness.ts:67,213-228`). The residual credit-guard / remaining-credits leg is owned by `TASK-harness-surfacing-exec-log-sse-to-chat-usage-ledger-credit-g`, not here.
**Priority:** medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

Imported from git issue 5321999.

git issue: 5321999
