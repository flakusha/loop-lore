<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: shadow_notes table missing TTL/visibility/author_type columns

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

**Where**: src/db/schema-manifest.ts:779-786

**What**: Schema is {id, chat_id, type, content, status, created_at} only — migration to add 9 spec columns.

**Fix**: Add a migration extending shadow_notes with TTL, visibility, author_type and other spec columns.

**Source**: FEAT-006 gap audit (.tmp/audit/SYNTHESIS.md)

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
