<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: memory_audit_log action column typed string not union

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

**Where**: src/db/schema-core.ts:1161

**What**: Service has union, no DB enforcement — add CHECK constraint on action enum.

**Fix**: Add a CHECK constraint enforcing the action enum at the DB level.

**Source**: FEAT-075 gap audit (.tmp/audit/SYNTHESIS.md)

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
