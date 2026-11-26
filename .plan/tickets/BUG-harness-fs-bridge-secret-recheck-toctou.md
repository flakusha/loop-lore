<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Harness fs bridge secret recheck TOCTOU

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-security-sandboxing
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

The read/write bridges in src/integrations/harness/runtime.ts now re-apply resolveWithinScope and isSecretBasename immediately before open/write, but a symlink can still flip between the check and the syscall. Full closure needs openat2 with RESOLVE_BENEATH (or a platform equivalent) so the opened descriptor is confined. Add a test that races the symlink swap where the platform permits.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
