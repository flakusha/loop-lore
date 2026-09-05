<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: mention-parser regex fails on multi-word names

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

parseMentions regex fails for names with spaces (e.g. @Luna Maxim) and prefix-match determinism edge cases (mention-parser.ts). Boundary tests written (test-coverage-tiers commit 31383174aa6ab1f21ca5a741f7ba1acc763bfa41) but 2 tests still fail.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
