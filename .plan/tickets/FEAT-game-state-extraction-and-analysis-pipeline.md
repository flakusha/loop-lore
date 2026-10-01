<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Game state extraction and analysis pipeline

**Status:** In Progress
**Priority:** high
**Effort:** Medium
**Epic:** epic-chat-product-features.md
**Tags:** features
**Summary:** Extract structured game state from LLM narration and analyze it: fenced ```game-state JSON blocks in assistant messages → regex extractor (`src/regex/game-state.ts`) → `game_states` table (migration 021) keyed by chat_id/message_id → diff analysis vs previous state (movements, added/removed) → `GET /api/v1/chats/:id/game-state(s)` → prompt section `src/assistant/prompt/sections/game-state.ts`. Persistence hook wired in `src/generation/auto-gen/store-message.ts` (non-fatal).
**Context:** Companion ticket to FEAT-2d-interactive-game-canvas-for-chat-scenes (canvas consumes the same API). Contracts and edge cases fixed in `docs/spec/game-canvas.md`.
**Acceptance Criteria:** See ## Acceptance Criteria below.

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
