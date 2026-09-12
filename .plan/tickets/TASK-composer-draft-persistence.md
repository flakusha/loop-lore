<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Composer draft persistence

**Epic:** epic-chat-composer-flows.md (proposed)
**Type:** Feature | **Priority:** High | **Effort:** S

## Problem

Composer input is lost on reload/navigation. `_draft` grep hits only
`prompt-improve.ts`; no per-chat draft store. Distinct from
TASK-chat-feature-entry-field-pre-send (send-blocking buffer), which is
about validation, not persistence.

## Change

- Alpine `chat-send.ts`: localStorage draft per `chatId` (debounced 300ms),
  Restore on mount, clear on send. Cap 10KB/draft, LRU 20 chats. Local-only v1 (plaintext in localStorage — never send to server unencrypted).
- Optional server fallback only if trivial: reuse existing chat settings
  blob; else local-only with `// ponytail: local-only drafts, server sync if multi-device demand`.
- Reply-context (`parent_id` preview) persisted alongside text.

## Acceptance

- Reload restores text + reply preview; send clears draft.
- No server schema change required for v1.

## Implementation (2026-09-12, worktree chat-messenger-parity)

Local-only v1 in `4d3fbd12a` — `src/frontend/alpine/chat-drafts.ts`
(`ChatDraftStore` localStorage class, debounced save, 10KB/draft, LRU 20),
wired into `chat-send.ts` (save/flush/restore) and `world.ts` (flush+restore
on chat switch). 47 tests across `chat-drafts`/`chat-send`/`world` suites.
Server sync deferred per ticket (`// ponytail` marker in code).
