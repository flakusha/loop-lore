<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: delete audit action has no unit test

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** ✅ Resolved (already on dev, 2026-09-21)
**Priority:** medium
**Effort:** Medium

## Summary

**Where**: src/routes/actor-memories.ts:149

**What**: Fires delete audit — add test asserting action:delete audit row.

**Fix**: Add a unit test asserting an action:delete audit row is recorded.

**Source**: FEAT-075 gap audit (.tmp/audit/SYNTHESIS.md)

## Resolution

Already fixed on dev by `3747127e5` (`feat(memory): enforce audit action enum at DB + add delete/inject tests`).
Verified 2026-09-21 against dev HEAD `b85385c85`:

- `src/memory/audit.test.ts` — test asserting `action:delete` audit row is recorded on delete.
- Cross-references: `BUG-memory-audit-log-action-column-typed-string-not-union` and `BUG-inject-audit-action-has-no-unit-test` are also ✅ Resolved (same commit).

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
