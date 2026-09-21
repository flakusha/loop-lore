<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: memory_audit_log action column typed string not union

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** ✅ Resolved (already on dev, 2026-09-21)
**Priority:** medium
**Effort:** Medium

## Summary

**Where**: src/db/schema-core.ts:1161

**What**: Service has union, no DB enforcement — add CHECK constraint on action enum.

**Fix**: Add a CHECK constraint enforcing the action enum at the DB level.

**Source**: FEAT-075 gap audit (.tmp/audit/SYNTHESIS.md)

## Resolution

Already fixed on dev by `3747127e5` (`feat(memory): enforce audit action enum at DB + add delete/inject tests`).
Verified 2026-09-21 against dev HEAD `b85385c85`:

- DB-level CHECK constraint on `memory_audit_log.action` enforced via the migration in `src/db/migrations/001_init.ts` (collapsed to single file in commit `03bb19c91`).
- Type union mirrored at the application layer in `src/memory/audit.ts`.
- Cross-references: `BUG-delete-audit-action-has-no-unit-test` and `BUG-inject-audit-action-has-no-unit-test` are also ✅ Resolved (same commit, added the missing tests).

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
