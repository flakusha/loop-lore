<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Chat: Overview & Data Model

> **Status:** Core 1:1 chat, message tree, and world/location binding are implemented
> (src/ pointers below). Group-chat behaviors, the per-chat assistant entity, and
> per-chat response styles are designed but not implemented.

## Implemented

- Chat structures: `chats.type` direct/group, `chat_participants` table, new-chat UI
  (`src/db/schema-core.ts`).
- Message tree: `parent_id` linking. First message is root; a user message points at the
  actor message it responds to; actor messages point at the triggering user message;
  **swipe variants share a `parent_id`** (siblings, not children); the visible timeline is
  an in-order traversal of the **active path**; **continuation messages** chain as children
  of partial/cancelled messages (A → Continue B → Continue C); injected narration appears
  as system-labelled messages in the timeline.
- Chat master (creator): delete any message, freeze panels, configure assistant, manage
  participants. Non-masters delete own only; admin overrides all; solo mode master = local
  user; both users are co-masters in User × User chats.
- World + Location: world has many locations; a chat optionally binds one location
  (changeable mid-chat); prompt injects `{{location.name}}`, `{{location.description}}`,
  `{{location.connections}}`.

## Not implemented / aspirational

- Group behaviors — talkativity scores bias _which_ actor is selected
  (`src/group-chat/turn-selector.ts`) but do not yet influence _how much_ the selected
  actor says (see `.plan/epics/epic-world-chat-channels-invites.md` G2). Multi-user
  participants blocked: new-chat UI filters out `actor_type = user`. `ChatMode.Story` is
  selectable but the story API/turn-manager is unwired. See [group-chat.md](./group-chat.md).
- Per-chat assistant entity (Pure Assistant / GM / Moderator / Agent roles) — only a global
  rule-based responder exists (`src/assistant/service.ts`). See [assistant.md](./assistant.md).
- Response Style per chat (Short / Default / Detailed / Custom max_tokens 50–2000) —
  planned; future `response_style` column (migration 008), mid-chat changes affect future
  generations only. Full design: `.plan/epics/epic-chat-lifecycle-moderation.md`.

## Chat types

- User × Character — standard roleplay; assistant optional mediator.
- User × User — collaborative storytelling/co-writing; assistant optional GM/dice/narration.
- User × Assistant — assistant as agent: edits text, generates images, develops story.

## Epics

- `.plan/epics/epic-chat-lifecycle-moderation.md` — ChatType / ChatMode / ResponseStyle axes.
- `.plan/epics/epic-group-chat.md` — group chat feature epic (partial).
- `.plan/epics/epic-world-chat-channels-invites.md` — turn-order/talkativity reconciliation.
- `.plan/epics/epic-messages.md` — message pipeline.

Sub-docs: [layout.md](./layout.md) · [message-bubbles.md](./message-bubbles.md) · [message-actions.md](./message-actions.md) · [generation.md](./generation.md) · [archiving.md](./archiving.md) · [input.md](./input.md) · [memories.md](./memories.md) · [assistant.md](./assistant.md) · [group-chat.md](./group-chat.md) · [templates.md](./templates.md) · [multi-llm-story.md](./multi-llm-story.md).
