<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: shadow_notes table missing TTL/visibility/author_type columns

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** ✅ Resolved (already on dev, 2026-09-21)
**Priority:** medium
**Effort:** Medium

## Summary

**Where**: src/db/schema-manifest.ts:779-786

**What**: Schema is {id, chat_id, type, content, status, created_at} only — migration to add 9 spec columns.

**Fix**: Add a migration extending shadow_notes with TTL, visibility, author_type and other spec columns.

**Source**: FEAT-006 gap audit (.tmp/audit/SYNTHESIS.md)

## Resolution

Already fixed on dev by `a56735afb` (`feat(db): shadow_notes TTL + author_type columns + LLM filter`).
Verified 2026-09-21 against dev HEAD `b85385c85`:

- `src/db/schema-manifest.ts:774-784` — shadow_notes table now has `visibility`, `expires_at`, `author_type` columns (plus existing 5 base columns).
- Migration applied: `src/db/migrations/001_init.ts` (collapse base migration; columns are part of the canonical schema since the refactor commit `03bb19c91`).
- LLM-filter wiring lands in same commit (`a56735afb`).
- Cross-references: `BUG-shadow-notes-missing-visibility-for-llm-injection-control` is also ✅ Resolved (same commit, same column).

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
