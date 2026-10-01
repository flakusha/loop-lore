<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: slash autocomplete regex not caret anchored swallows enter

**Status:** Done
**Priority:** medium
**Effort:** Medium

**Summary:** slashTokenRe (src/frontend/alpine/slash-autocomplete.ts:31) is `/(?:^|\s)\/([a-z][a-z0-9_-]*)?(?=\s|$)/i` — not anchored to the caret segment, so after fully typing '/cmd args' the stale token still matches, Enter is intercepted for autocomplete instead of sending, and multi-token input can replace the wrong token. Fix: extract the token strictly from the text segment ending at the caret (require match end at cursor) and close the popover once args are typed. Verify: bun test src/frontend/alpine/slash-autocomplete tests plus manual Enter-after-args flow.
**Context:** Found 2026-09-26 during orchestrated strict review of dev commits 2026-09-19..26; finding verified directly in code before filing.
**Acceptance Criteria:**
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Verification command from ticket executed green

## Verification Notes (2026-10-01)

Re-verified against current `dev`; the defect this ticket describes is
already fixed. The ticket was left open past the fix.

Evidence: `src/frontend/alpine/slash-autocomplete.ts:40-43`

- `findCaretToken` only returns a match ending at the caret, so the popover closes once arguments are typed and Enter is not swallowed.
