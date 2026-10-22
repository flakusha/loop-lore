<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: GAME_STATE_BLOCK regex truncates payloads containing an inner fenced code block

**Status:** Done
**Status Note:** the regex fix this ticket asks for is already on dev — commit 2c2dc5e09 ("fix(regex): anchor game-state closer to line start") changed the closer from an inline marker to a line-anchored one, so a fence inside the payload no longer cuts the capture short. What was missing is the pin the ticket itself asks for: no inner-fence payload case existed, so the behaviour was unguarded against a regression. `src/regex/game-state.test.ts` now carries that case.
**Priority:** low
**Effort:** Medium
**Caveats:** observability — a payload whose inner fence sits at the START of a line still truncates the capture, but such a payload cannot be valid JSON (a JSON string may not contain a raw newline), so the consumer rejects it either way; the behaviour under test is the inline-fence case the ticket reported, which the line-anchored closer now captures whole; rollback — reverting 2c2dc5e09 makes the new test fail, which is the intended tripwire

**Summary:**

Location: src/regex/game-state.ts:17.

Evidence: the lazy [\s\S]*? capture stops at the first inline fence marker (three backticks) anywhere in the payload, including a fence that is part of the game-state string content itself (e.g. code embedded in a description field).

Verification: REPRODUCED - probe .tmp/glm-review/verify/regex-captures.ts imports the real GAME_STATE_BLOCK export: decisive output 'captured payload truncated at the inner fence' - a payload whose string value contains an inner fenced code block extracts only the text before it (payload {a: code + three-backticks + json here} extracts as {a: code ).

Impact: the consumer (src/game-state/service.ts:68-71) safely rejects the truncated JSON, so the whole game-state block is silently dropped - state updates vanish, no corruption.

Fix: terminate on a line-anchored fence instead of any inline marker: [\s\S]*? followed by (?:^|\n), then the three-backtick marker, then (?:\s*$|\n); pin with an inner-fence payload case.

Source: .tmp/glm-review/deep-regex-1015.md F-3 (gitignored; recorded here verbatim).

**Context:**

The evidence in this ticket was gathered against the regex as it stood before commit 2c2dc5e09, whose closer was the bare inline marker (three backticks) and therefore matched a fence anywhere in the payload. The closer is now anchored to a line start, so an inline fence inside a payload value no longer terminates the capture — the defect the ticket reports is already fixed on dev.

What remained was the pin the ticket asks for ("pin with an inner-fence payload case"): the extractor had no case covering a payload that contains a fence, so a future edit could have re-introduced the truncation without any test going red. The added case covers the reported shape — a string value holding a backtick fence — and fails against the pre-2c2dc5e09 regex.

Tightening the closer further (requiring the fence to be the only thing on its line, as the ticket's regex sketch suggests) was considered and rejected: with the closer already line-anchored it changes no observable outcome for a valid payload, and it would stop a fence line carrying trailing text from closing a block.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

- Already fixed on dev by commit 2c2dc5e09 ("fix(regex): anchor game-state closer to line start"): the closer in `src/regex/game-state.ts:17,20` is line-anchored, so the lazy capture no longer stops at an inline fence inside the payload.
- `src/regex/game-state.test.ts`: new case "does not early-close on a backtick fence inside the payload" — a payload whose string value holds a fence is captured whole. The same case fails against the pre-2c2dc5e09 closer, so it is a real tripwire.
- No source change in this batch.

**Resolved:** 2026-10-22 registry-driven close: git issue 1071224 (registry tip: 2c7cc6f76 Konstantin Fedotov Auto-closed: appended .md marker marks BUG-GAME-STATE-BLOCK-REGEX-TRUNC)
