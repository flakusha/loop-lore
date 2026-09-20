<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: shadow notes missing visibility for LLM injection control

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

**Where**: src/db/schema-manifest.ts (shadow_notes)

**What**: status field is user-reveal only — spec §Shadow Note Rules requires injection-independent visibility column.

**Fix**: Add a separate visibility column that is independent of user-reveal status and gates LLM injection.

**Source**: FEAT-006 gap audit (.tmp/audit/SYNTHESIS.md)

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
