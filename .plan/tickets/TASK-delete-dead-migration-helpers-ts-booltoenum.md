<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Delete dead migration-helpers.ts boolToEnum

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

boolToEnum/batchBoolToEnum in src/db/migration-helpers.ts have zero importers (verified by grep). Delete file, fix docs/meta/admin-visibility-research.md bullet, close stale TASK-cleanup-banned-types checkbox as obsolete. Future shipped-bool policy: keep INTEGER + CHECK IN (0,1), never temp-col rewrite.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
