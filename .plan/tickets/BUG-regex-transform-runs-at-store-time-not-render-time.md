<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: regex transform runs at store time not render time

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

**Where**: src/generation/auto-gen/store-message.ts:79; src/generation/auto-generation.ts:165

**What**: transformed flag at :51 returned but unused in auto-generation.ts:165.

**Fix**: Move regex transforms to render time and consume the transformed flag at the call site.

**Source**: FEAT-013 gap audit (.tmp/audit/SYNTHESIS.md)

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
