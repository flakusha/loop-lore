<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Chat Composer Flows (draft for new worktree)

**Effort:** Medium
**Type:** epic
**Overview:** (see sections below)


**Status:** Done
**Status Note:** Confirmed Done 2026-10-23 — worktree delta (91c3da2a0, 36de8ddd7, 7f0ed0ecd) is interconnect/plan-artifact regeneration and epic closeout, not scope work.
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

- [x] [TASK-msg-forward-across-chats](../tickets/TASK-msg-forward-across-chats.md) — Done
- [x] [TASK-composer-draft-persistence](../tickets/TASK-composer-draft-persistence.md) — Done
- [x] [TASK-scheduled-messages-reminders](../tickets/TASK-scheduled-messages-reminders.md) — Done
- [x] [FEAT-llm-enhance-outside-the-chat-composer](../tickets/FEAT-llm-enhance-outside-the-chat-composer.md) — Done
- [x] [TASK-composer-primitive-extraction](../tickets/TASK-composer-primitive-extraction.md) — Done
- [x] [FEAT-llm-enhance-any-text-surface](../tickets/FEAT-llm-enhance-any-text-surface.md) — Done
- [x] [TASK-shared-text-surface-toolbar](../tickets/TASK-shared-text-surface-toolbar.md) — Done
- [x] [TASK-migrate-text-surfaces-to-shared-primitives](../tickets/TASK-migrate-text-surfaces-to-shared-primitives.md) — Done

## Anchors

- `src/routes/messages/reply.ts` — reply/parent_id pattern to reuse.
- `src/routes/chat-messages.ts`, `src/chat/service/write.ts` — write path.
- `src/frontend/alpine/chat-send.ts`, `chat-actions/` — composer seam.
- `src/chat/service/visibility.ts` — access-check pattern.
- `src/notifications/service/service.ts` (`NotificationService.create/list`) — reminder delivery seam.

## Acceptance

- Forward round-trips with original attribution, no cross-chat leak.
- Draft survives reload; scheduled send fires within 1min window.

**Resolved:** 2026-10-22 registry-driven close: git issue f0bd7e8 (registry tip: 86196ff0d Konstantin Fedotov Auto-closed: appended .md marker marks EPIC-CHAT-COMPOSER-FLOWS done)
