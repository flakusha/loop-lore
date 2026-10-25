<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: BYO decrypt failure silently falls back to server key

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-byok-api-keys
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Decrypt failure (wrong/rotated encryptionKey, corrupt row) only warn-logs (registry.ts:136-144); user believes their key used while server key billed. Fix: surface 4xx/flag to caller or emit metric + user-visible warning.

**Context:**

Closure rationale (verified 2026-10-25 against the current implementation): the closure rationale recorded in the Status Note above

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue f06f2d2 (registry tip: dee54e99e Konstantin Fedotov Close issue)
