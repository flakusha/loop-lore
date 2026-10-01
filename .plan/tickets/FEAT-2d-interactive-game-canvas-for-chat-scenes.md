<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: 2D interactive game canvas for chat scenes

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-2d-sprite-world.md
**Tags:** 2d-graph, canvas
**Summary:** Render extracted game state as interactive 2D canvas in the chat view: Alpine `gameCanvas(chatId)` draws grid + entity tokens on `<canvas>`, click-to-select token detail, refresh on activity. Partial `src/components/chat/game-canvas.html`, mount in `src/views/chat.html`, component `src/frontend/alpine/game-canvas.ts`. API: `GET /api/v1/chats/:id/game-state` → `{messageId, createdAt, state, analysis}`.
**Context:** Companion ticket to FEAT-game-state-extraction-and-analysis-pipeline (extractor, DB, service). Contracts fixed in `docs/spec/game-canvas.md` (data flow, rendering rules, edge cases).
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
