<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Guard sql.ref identifier construction in optimistic locking

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/db/optimistic-locking.ts:66 — sql.ref(column) builds identifiers from updates-object keys; today's sole caller hardcodes keys, but API permits injection-by-identifier if a future caller passes user-derived keys. Fix: assert keys against table column allowlist inside applyOptimisticUpdate.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
