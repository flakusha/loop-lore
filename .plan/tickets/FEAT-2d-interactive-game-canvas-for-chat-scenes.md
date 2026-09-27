<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: 2D interactive game canvas for chat scenes

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Render extracted game state as interactive 2D canvas in chat view. Alpine component gameCanvas(chatId) draws grid + entity tokens on <canvas>, click-to-select token detail, refresh on activity. Files: src/frontend/alpine/game-canvas.ts, src/components/chat/game-canvas.html partial, mount in src/views/chat.html. API contract: GET /api/v1/chats/:id/game-state returns {messageId, createdAt, state, analysis}. Covered by docs/spec/game-canvas.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
