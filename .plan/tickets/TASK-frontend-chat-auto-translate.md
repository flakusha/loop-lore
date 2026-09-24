<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend — Chat Auto-Translate Toggle

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** P2 — Medium
**Effort:** Small
**Epic:** epic-chat-product-features
**Related:** TASK-per-chat-auto-translation-layer
**Source:** FE-BE harmonization check, 2026-09-17 — 2 routes in this slice.

## Summary

Wire the per-chat auto-translate toggle UI (PATCH to set / DELETE to clear).
Backend routes exist; web UI has no caller.

## Backend surface

| Method | Path | File |
|--------|------|------|
| PATCH | `/api/chats/:id/auto-translate` | `src/routes/chats/auto-translate.ts:27` |
| DELETE | `/api/chats/:id/auto-translate` | `src/routes/chats/auto-translate.ts:64` |

## Acceptance Criteria

- [ ] Chat settings panel exposes auto-translate toggle
- [ ] Enabling calls PATCH; disabling calls DELETE
- [ ] State reflected in chat header indicator
- [ ] `bun run check` green
