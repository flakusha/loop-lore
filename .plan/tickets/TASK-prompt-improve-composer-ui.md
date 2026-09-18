<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Composer "improve my prompt" UI affordance

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Epic:** epic-prompt-improvement.md
**Status:** In Progress
**Priority:** High

## Scope

- `src/components/chat/input-area.html`: add an ✨ Improve button next to the
  send button with a level menu (spellcheck / wording / expand / strict /
  creative / chat style / group style). Shared component → direct chat,
  group chat, and mobile composer all inherit it.
- New Alpine module `src/frontend/alpine/chat-actions/prompt-improve.ts`
  merged into `chatActions`: `improvePrompt(level)` — reads
  `$refs.messageInput`, POSTs to `/api/generation/prompt`, replaces the
  draft on success, keeps the previous draft for one-click undo, surfaces
  failures via the existing toast pattern (`$dispatch("show-toast", …)`).
- Auto-select `style-group` for group chats; `_improving` loading state
  disables the button.
- Command-button row `✨ Improve` (existing `command-buttons.ts` entry)
  keeps working — the slash command now runs the same service.

## Acceptance

- Unit test for the Alpine module (fetch stubbed) asserting draft
  replacement, undo backup, and error toast; no page errors on interaction.
