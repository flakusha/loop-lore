<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: BYO decrypt failure silently falls back to server key

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Decrypt failure (wrong/rotated encryptionKey, corrupt row) only warn-logs (registry.ts:136-144); user believes their key used while server key billed. Fix: surface 4xx/flag to caller or emit metric + user-visible warning.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
