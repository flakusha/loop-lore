<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Auto-gen assemble() omits providerId/tokenBudget and never compacts

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

prepare-generation.ts:90 passes no providerId/tokenBudget -> budget defaults 32000, ignores model context; assemble() never compacts, compactPromptHistory dead. Pass providerId + tokenBudget; add compaction to auto-gen path.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
