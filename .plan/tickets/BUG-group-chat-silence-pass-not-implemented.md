<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Group chat cascade has no silence / pass-through mechanic — every cascade turn forces an LLM generation regardless of relevance

**Status:** Not Started
**Severity:** medium
**Priority:** medium
**Effort:** medium
**Type:** BUG
**Epic:** epic-chat-lifecycle-moderation, epic-group-chat
**Files:** src/group-chat/mention-parser.ts (no PASS detection); src/generation/auto-gen/group-cascade.ts; src/db schema (silence/pass columns if added); configs/templates/group-chat-defaults.yaml (if applicable)

## Issue

The group chat cascade always triggers an LLM generation when an actor is selected. There's no:

- **Silence probability** — every selected actor must respond, even when the previous turn didn't warrant their input.
- **`[PASS]` detection** — common in human group chat RP, actors opt out by typing `[PASS]` to indicate "no reply from me". Currently no parser recognizes this token.
- **Skip-on-low-relevance heuristic** — an actor whose name wasn't @mentioned and whose character isn't active in the current scene shouldn't be forced to chime in.

Verified: zero matches for `PASS|silence|skipProbability|noReply` in `src/group-chat/`. The mechanic simply doesn't exist.

## Why it matters

Coherence + cost. Group chats feel forced: every selected actor produces a message even when narratively it should be silence. Cost-of-generation continues for empty / low-value replies. Real group RP relies on `[PASS]` for actors who have nothing to add.

## Evidence

- `src/group-chat/mention-parser.ts` — no PASS token parsing.
- `src/generation/auto-gen/group-cascade.ts:88-178` — cascade unconditionally triggers `triggerAutoGeneration` after selection.
- Grep confirmed: no `silence` / `pass` / `skipProbability` handling anywhere in `src/group-chat/`.

## Concrete fix

1. Add silence probability config in `config.templates.groupChat.silenceProbability` (default 0 = off). When set, before each cascade trigger, roll `Math.random() < silenceProbability` and skip generation (log `cascade.skipped.silence`).
2. Detect `[PASS]` token in `mention-parser.ts`: extend `parseMentions` to also return a `passTokens: ParsedPassToken[]` array; cascade filters selected actors that have `[PASS]`-flagged from their last message.
3. Falling back to `skip-on-low-relevance`: when an actor is NOT in the recent 3 messages' `actor_ids` AND NOT @mentioned AND NOT selected by strategy weight > 0.7, mark them as `passive` and exclude from cascade this depth.
4. Emit a `messages.content = "[PASS]"` system message so the cascade depth is observable in chat history (otherwise the skip is invisible).
5. Tests:
   - `silenceProbability = 1.0` → cascade never fires.
   - Actor's last message is `[PASS]` → excluded from next selection.
   - 3-actor group, none @mentioned, none recent → 2 of 3 marked passive (skip-on-low-relevance).
   - `[PASS]` detection: input `"I have nothing to say [PASS]"` → `parseMentions` returns `[{ type: "pass", raw: "[PASS]" }]`.

## Tests

- `bun test src/group-chat/mention-parser.test.ts` — PASS detection.
- `bun test src/generation/auto-gen-cascade.test.ts` — silence probability + skip-on-low-relevance + PASS filtering.

## Related

- `epic-chat-lifecycle-moderation.md` (cascade semantics).
- `epic-battle-action-systems.md` (initiative is similar — opt-out of turn via `[SKIP]`).
