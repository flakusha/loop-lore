<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: lore-consistency scorer entity-matching branch unreachable (dead code)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** medium
**Effort:** Medium

## Summary

src/story/quality/scorers/lore-consistency.ts:18-32: scoreLoreConsistency lowercases lore/response BEFORE calling extractEntities, but extractEntities only matches capitalized ASCII words (`\b[A-Z][a-z]{2,}...`). The entity-matching branch (matchRatio scoring, +15/+8/-15 adjustments) is unreachable — every non-null lore scores exactly 70. Existing test at line 35-37 documents this. Fix: lowercase after entity extraction, or make extractEntities case-insensitive. Found by test-edge-case-strengthening worktree (StoryCore agent).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
