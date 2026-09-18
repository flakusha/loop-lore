<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Chat Composer Flows (draft for new worktree)

**Effort:** Medium
**Type:** epic
**Overview:** (see sections below)


**Status:** Proposed
**Priority:** High — messenger parity gap
**Tags:** chat, messenger, forward, drafts, scheduled, reminders

## Why

Mobile context menu already lists Forward with no backend; composer has no
draft persistence (`_draft` hits only prompt-improve); scheduled send and
reminders have zero implementation (only admin/blog hits). All verified
2026-09-12 via route/code grep. No overlap with active worktrees
(encryption-key-rotation, ownership-transfer-gaps, unit-test-coverage,
vn-sprite-compositing) or the 25 existing TASK-chat-feature-* tickets.

## Scope

- Forward message(s) across chats with attribution + access checks.
- Composer draft autosave per chat (local-first, server fallback).
- Scheduled send + per-message reminders (quiet-hours aware).

## Non-goals

- Emoji/reactions frontend (TASK-emoji-colon-format-frontend,
  TASK-message-reactions-in-out-context already cover).
- Folders/tags/archive (TASK-chat-feature-chat-organization-folders-tags,
  TASK-chat-feature-archive-deletion-search).
- Crypto rotation / ownership transfer (active worktrees).

## Tickets

- TASK-msg-forward-across-chats.md
- TASK-composer-draft-persistence.md
- TASK-scheduled-messages-reminders.md

## Anchors

- `src/routes/messages/reply.ts` — reply/parent_id pattern to reuse.
- `src/routes/chat-messages.ts`, `src/chat/service/write.ts` — write path.
- `src/frontend/alpine/chat-send.ts`, `chat-actions/` — composer seam.
- `src/chat/service/visibility.ts` — access-check pattern.
- `src/notifications/service/service.ts` (`NotificationService.create/list`) — reminder delivery seam.

## Acceptance

- Forward round-trips with original attribution, no cross-chat leak.
- Draft survives reload; scheduled send fires within 1min window.
