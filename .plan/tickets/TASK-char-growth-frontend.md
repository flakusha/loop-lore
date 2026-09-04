<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: char-growth-frontend

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Small

## Summary

Player card "Character Journey" partial (`src/views/partials/character-journey.html`). Author/GM editor partial + Alpine.js wiring (`src/views/partials/character-growth-editor.html`, `src/frontend/character-growth-editor.js`).

## Acceptance Criteria

- [ ] Player card renders arc + last 3 applied entries (no internal fields)
- [ ] Author editor: growth_mode radio, llm_assist toggle, arc dropdown, growth log table with confirm/reject
- [ ] Alpine.js component invokes the API surface (saveMode, saveArc, confirmEntry, rejectEntry)
