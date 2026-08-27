<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Message Seen/Unseen Indicator & Viewer List (Frontend)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Labels:** frontend, messages, seen
**Epic:** epic-message-seen-state

## Summary

Render a seen/unseen indicator on message bubbles and a viewer-list popover (who has seen / who is processing), mirroring the reaction chips / quick-picker UI.

## Current State

- `message-list.html` (chat frontend) renders reaction chips + a quick-emoji picker popover (`TASK-message-quick-emojis-frontend`, commit `4ec0054`). Reuses pre-existing reaction CSS classes and `addReaction` i18n key across 10 locales.
- Chat UI tests live in `src/frontend/.../chat-messages.test.ts`.

## Change

- Add a seen indicator to each message bubble (e.g. delivered / seen glyph), hidden for the viewer's own messages unless other actors exist.
- Add a viewer-list popover triggered from the indicator, listing actors with their `state` (`seen` / `processing` / `unseen`) and `seen_at`.
- Add i18n keys: `seenBy`, `processingMessage` (for AI "begun processing"), `notSeen`, in all locales (mirror the 10-locale `addReaction` addition).
- Wire the popover to `GET /api/messages/:id/seen` and the indicator to the realtime seen event (see `TASK-message-seen-realtime-broadcast`).
- Reuse reaction CSS classes where styling overlaps.

## Acceptance Criteria

- [ ] Indicator shows seen/unseen per message for the current viewer set.
- [ ] Viewer-list popover lists actors with state + `seen_at`.
- [ ] i18n keys added to all locales; `bun test` (chat-messages) covers indicator + popover.
- [ ] `bun run check` green (ts/css/html lint + dprint).
