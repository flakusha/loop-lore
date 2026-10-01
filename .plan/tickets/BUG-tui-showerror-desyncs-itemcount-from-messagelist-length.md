<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: tui showError() desyncs itemCount from messageList length

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** low
**Effort:** Medium

## Summary

src/tui/chat/index.ts: showError() appends a line to messageList but never increments itemCount (unlike addMessage/showTyping). Consequences: itemCount desyncs from actual list length; scrollToBottom() cannot select the error line (itemCount stays 0). Found by test-edge-case-strengthening worktree (TransportTui agent). Fix: increment itemCount in showError() or share a common append helper.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated


## Verification Notes (2026-10-01)

Re-verified against current `dev`; the defect described in this ticket is
already fixed. The ticket was left open past the fix.

Evidence: `src/tui/chat/index.ts:219-226`

- `showError()` now increments `itemCount`, and `show-error.test.ts` covers it.
