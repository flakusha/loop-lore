<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Group cascade depth boundary semantics off-by-one — max_turns=3 produces 4 AI messages

**Status:** Not Started
**Severity:** high
**Priority:** high
**Effort:** small
**Type:** BUG
**Epic:** epic-chat-lifecycle-moderation, epic-chat-context-optimization
**Files:** src/generation/auto-gen/group-cascade.ts:88-178 (especially 105-110)

## Issue

Line 107: `if (depth >= maxTurns) return;`. The doc comment on line 105 says `max_turns=1 means 1 AI reply per user message` — but the code semantics are different from the comment. The first AI reply to a user message happens at `depth=0` (initial generation), then cascade runs `depth=0 → depth+1=1`. Callers store `max_turns=3` meaning "up to 3 AI replies including the first" but the implementation delivers `maxTurns` cascade hops **after** the first reply, so `max_turns=3` produces 4 AI messages total.

Existing tests (`auto-gen-cascade.test.ts`) only exercise `maxTurns=0` and `maxTurns=2` with `depth=2` — they don't catch this off-by-one. There is also no test for `maxTurns=null | undefined` (falls back to 3, undocumented default).

## Why it matters

UX / cost predictability. Chat creators set `max_turns` based on documentation saying one thing; the implementation delivers another. Unpredictable cascade lengths make cost / UX planning impossible. A user with `max_turns=2` expecting "AI replies twice after my message" gets three.

## Evidence

- `src/generation/auto-gen/group-cascade.ts:102-110` — `maxTurns = chat.max_turns ?? 3; ... if (depth >= maxTurns) return;`.
- `src/generation/auto-gen-cascade.test.ts:301-541` — only `maxTurns=0` and `maxTurns=2` cases.
- `post-store.ts:197` — caller of `triggerGroupCascade` passes `depth: 0` for the first cascade hop.

## Concrete fix

1. Decide on one semantic. Recommend: `max_turns` = total AI replies including the first user→AI hop (matches the chat creation UI label and existing epic docs).
2. Change the depth check to `if (depth + 1 > maxTurns) return;` (where `depth + 1` represents the AI message about to be created, counting from 1).
3. Update the doc comment to reflect the chosen semantic and add a worked example: `max_turns=3` → 3 AI replies.
4. Make the default explicit: `DEFAULT_MAX_TURNS = 3` exported constant used both in code and in the migration that adds the column.
5. Add tests:
   - `maxTurns=1` → exactly 1 AI reply, cascade returns immediately.
   - `maxTurns=3` → exactly 3 AI replies (current behavior: 4). Verify by counting messages after user message.
   - `maxTurns=null` → default 3.
   - `maxTurns=0` → no cascade at all (figure returns immediately).

## Tests

- `bun test src/generation/auto-gen-cascade.test.ts` — add the four cases above.

## Related

- `BUG-group-cascade-mid-cascade-pause-ignored` (companion).
- `TASK-reconciliation-plan.md` (mentions cascade as one of 6 unwired paths).
- `epic-chat-lifecycle-moderation.md`, `epic-chat-context-optimization.md`.
