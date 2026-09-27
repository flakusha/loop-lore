<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Game state extraction and analysis pipeline

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Extract structured game state from LLM narration and analyze it. Fenced ```game-state JSON blocks in assistant messages -> regex extractor (src/regex/game-state.ts) -> persist game_states table (migration 021) keyed by chat_id/message_id -> diff analysis vs previous state (movements, added/removed entities) -> expose via GET /api/v1/chats/:id/game-state(s) -> inject compact state summary into prompt (src/assistant/prompt/sections/game-state.ts). Wiring: post-insert hook in src/story/game-master/narration.ts, non-fatal. Covered by docs/spec/game-canvas.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
