<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Adopt Bun.stringWidth for TUI

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** low
**Effort:** Medium
**Epic:** epic-terminal-ui

## Summary

Use Bun.stringWidth() and Bun.stripAnsi() for TUI string operations. ~6756x faster than string-width npm.

## Acceptance Criteria

- [x] Implementation complete — `src/tui/chat/display.ts:23,27` use `Bun.stringWidth()` for column-accurate truncation
- [x] Tests passing — `src/tui/chat/display.test.ts` covers surrogate pairs, CJK glyphs, ANSI codes
- [x] Documentation updated — no spec changes needed (internal optimization)
