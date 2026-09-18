<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Assistant Personality Composer Integration

**Status:** ⬜ Not Started
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
