<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Assistant Personality Composer Integration

**Status:** In Progress
**Status Note:** In Progress (verified 2026-10-18 against `dev` at `08ef7efe7`). The composer integration is LIVE on the assistant's prompt path, but only two of the five acceptance criteria are met as written. Met: the composer emits the right block per source — preset voice blocks via `renderPreset` (`src/assistant/personality/composer.ts:152`), the character persona block via `renderCharacter` (`composer.ts:168`), and nothing at all for `server-default` (`composer.ts:132`) — and those branches are unit-tested (`src/assistant/personality/composer.test.ts:90-99`); the block reaches the prompt through `src/assistant/prompt-assembler.ts:293` → `src/assistant/prompt-personality.ts:33` → the registered `assistantPersonalitySection` (`src/assistant/prompt/sections/assistant-personality.ts:14`, registered at `src/assistant/prompt/registry.ts:59`), with tests at `src/assistant/prompt-personality.test.ts` and `src/assistant/prompt/sections/assistant-personality.test.ts`. NOT MET: (a) "reads from a small cache; cache miss falls back to server default" — there is NO cache; state is resolved fresh from the chat's `gm_config` blob on every assembly (`composer.ts:88`, `prompt-personality.ts:33`) and grep finds no cache/TTL code in `src/assistant/personality/`; (b) "Section title `personality-blocks` injected between lorebook and character blocks" — the shipped section is named `assistantPersonality` (`assistant-personality.ts:15`) and is registered beside the assistant-identity blocks (`registry.ts:59`), not under the name `personality-blocks` nor at a lorebook/character position; (c) "Cached with TTL; invalidated by selector-ui write paths" follows from (a) — there is nothing to invalidate. Remaining: add the cache or amend the criterion, and reconcile the section name/position with the ticket text.
**Priority:** high
**Effort:** Medium
**Epic:** epic-character-multi-personality
**Tags:** assistant, prompt, composer

**Summary:**
Wire the active `AssistantPersonalityState` into the prompt composer so the assistant speaks in the chosen voice.

**Context:**
Composer (`src/assistant/prompt/`) currently has no personality hook. This ticket adds a section that, given `AssistantPersonalityState`, emits either preset promptBlocks, full character persona block, or empty (server default).

**Acceptance Criteria:**
- Composer reads `chatId -> AssistantPersonalityState` from a small cache; cache miss falls back to server default.
- Section title `personality-blocks` injected between lorebook and character blocks.
- Cached with TTL; invalidated by `assistant-personality-selector-ui` write paths.
- Unit tests: preset emits, character emits, default emits nothing.
- Existing prompt-assembly tests still green.
