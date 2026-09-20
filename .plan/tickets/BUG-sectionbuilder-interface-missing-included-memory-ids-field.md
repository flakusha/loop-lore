<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: SectionBuilder interface missing included_memory_ids field

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

**Where**: src/assistant/prompt/types.ts:168-173

**What**: Spec impl note requires extension — add field; populate from memorySection.build().

**Fix**: Add the field and populate from memorySection.build().

**Source**: FEAT-075 gap audit (.tmp/audit/SYNTHESIS.md)

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
