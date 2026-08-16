<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Social & Multiplayer

Together-layer ideas. Inspiration: roadmap co-editing, deferred D.5.

## #19 Co-authoring presence

- **Inspiration**: roadmap co-editing
- **What**: Live cursors, typing indicators, selection highlights during collaborative
  chat editing.
- **Fits**: WebSocket transport (`docs/spec/transport-unified.md`).
- **Effort**: Med
- **Depends on**: co-editing base, WS transport

## #20 Shared persistent worlds

- **Inspiration**: community request
- **What**: Multiplayer co-op storytelling on one world with CRDT sync.
- **Fits**: `docs/spec/users-sessions.md` multi-user model.
- **Effort**: High
- **Depends on**: multi-user sessions, CRDT layer

## #21 Public story feed + moderation

- **Inspiration**: export.md publishing (future)
- **What**: A "Shared Stories" feed built on publish infra, with content-moderation/
  safety controls.
- **Fits**: `docs/frontend/chat/export.md` publishing + `docs/frontend/admin.md`.
- **Effort**: Med
- **Depends on**: chat publishing

## #22 Async NPC mail

- **Inspiration**: deferred D.5
- **What**: NPCs send the user messages when they're away (letters from the world).
- **Fits**: `docs/frontend/notifications.md`.
- **Effort**: Med
- **Depends on**: #14 world clock, notifications
