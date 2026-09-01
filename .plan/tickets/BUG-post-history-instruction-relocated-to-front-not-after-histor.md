<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Post-history instruction relocated to front, not after history

**Status:** ✅ Fixed (fix-post-history-instruction-position @ ed1844be+3)
**Priority:** medium
**Effort:** Medium

## Summary

postHistorySection doc says appended after history; PROMPT_SECTIONS orders before chatHistory and reorderPromptMessages splices all system-role msgs to front, so <post_history> lands at prompt top. Render as trailing non-system msg or place after history.

## Fix

Two-part change in `src/assistant/prompt/`:

1. `sections/post-history.ts` — emit `role: "user"` instead of `role: "system"`,
   so `reorderPromptMessages` no longer splices the message to the front of the
   prompt.
2. `registry.ts` — move `postHistorySection` to the END of `PROMPT_SECTIONS`,
   AFTER `chatHistorySection`. Combined with (1), the post-history message
   now lands at the very end of the assembled messages — matching the
   documented SillyTavern semantics ("instructions appended after chat
   history") and the section's JSDoc.

The drop-priority (`postHistory: 4` in `PRIORITY`) is unchanged — post-history
instructions are still the second-priority drop target after examples when
the token budget is exceeded.

## Regression Test

`src/assistant/prompt-assembler.test.ts` — new describe block
`PromptAssembler post-history position`:

- Seeds an actor with `post_history_instructions` set.
- Seeds three chat-history messages (user, assistant, user) with explicit
  `created_at` ordering.
- Runs `PromptAssembler.assemble()` and locates the post-history message by
  its `<post_history>` XML tag.
- Asserts every chat-history message precedes the post-history message and
  that post-history is the last message in the assembled prompt.

Verified failing without the fix (post-history at index 4, chat-history at
indices 5–7) and passing with the fix.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated