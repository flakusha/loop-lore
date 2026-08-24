<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Post-history instruction relocated to front, not after history

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

postHistorySection doc says appended after history; PROMPT_SECTIONS orders before chatHistory and reorderPromptMessages splices all system-role msgs to front, so <post_history> lands at prompt top. Render as trailing non-system msg or place after history.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
