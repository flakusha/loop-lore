<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Message forwarding across chats

**Status:** open
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Epic:** epic-chat-composer-flows.md (proposed)
**Type:** Feature | **Priority:** High | **Effort:** M

## Problem

`docs/frontend/chat/message-actions.md` mobile + context menus list
Forward, but no route/service exists (grep 2026-09-12: only http-forward
and participant-forward false positives). Dead menu item.

## Change

- `POST /api/chats/:id/messages/:mid/forward` with `{ targetChatId }`:
  `checkChatAccess` on both chats (pattern: `src/routes/messages/create.ts:60`);
  decrypt source via message-content pipeline, re-encrypt to target chat keys
  — never copy ciphertext (cross-chat key leak). Attribution stored as body
  prefix `> Forwarded from <name>:` (no schema change; keeps FTS/encrypt intact).
- Attachments: re-link via asset-link flow only if target chat may access
  source asset (`attachment-ownership.ts` check); otherwise drop + note.
  Never carry reactions, pins, seen-state. Honor `Idempotency-Key` header
  (`src/middleware/idempotency-table.ts`); cap 5/call.
- Alpine: wire Forward menu → chat picker → optimistic placeholder.

## Acceptance

- Forward user→own chat and group→direct round-trips with attribution.
- Cross-user forward without target access → 403, no leak.
- Existing reply/quote tests green; new route tests: ok/forbidden/leak.

## Non-goals

- Share-links/export formats (TASK-chat-feature-share-links-export-formats).

## Implementation (2026-09-12, worktree chat-messenger-parity)

In `feb9bfca8` — `POST /api/chats/:id/messages/:mid/forward`
(`src/routes/messages/forward.ts`, shared loader `source-message.ts`):
decrypt-with-source-keys then re-encrypt for target, `> Forwarded from
<name>` body prefix, caller-owned attachments only (foreign counted as
dropped), idempotency-key replay, no commands/mentions/auto-reply by
design. 8 route tests. Deviations: single message per call (ticket's cap
of 5 moot); target-denied returns 404 not 403 (codebase convention hides
chat existence — same as read paths). No Alpine Forward-menu wiring yet.
