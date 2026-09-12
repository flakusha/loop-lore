<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Message forwarding across chats

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
