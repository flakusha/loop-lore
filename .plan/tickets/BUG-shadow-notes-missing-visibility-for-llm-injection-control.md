<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: shadow notes missing visibility for LLM injection control

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** ✅ Resolved (already on dev, 2026-09-21)
**Priority:** medium
**Effort:** Medium

## Summary

**Where**: src/db/schema-manifest.ts (shadow_notes)

**What**: status field is user-reveal only — spec §Shadow Note Rules requires injection-independent visibility column.

**Fix**: Add a separate visibility column that is independent of user-reveal status and gates LLM injection.

**Source**: FEAT-006 gap audit (.tmp/audit/SYNTHESIS.md)

## Resolution

Already fixed on dev by `a56735afb` (`feat(db): shadow_notes TTL + author_type columns + LLM filter`).
Verified 2026-09-21 against dev HEAD `b85385c85`:

- `src/db/schema-manifest.ts:781` — `visibility` column exists on shadow_notes, separate from `status` (user-reveal).
- Same commit wires the LLM-injection filter to gate on `visibility` (not on `status`).
- Cross-references: `BUG-shadow-notes-table-missing-ttl-visibility-author-type-column` is also ✅ Resolved (same commit).

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
