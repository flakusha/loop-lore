<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Composer draft persistence

**Status:** Done
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Epic:** epic-chat-composer-flows.md

**Status Note:** ChatDraftStore shipped (commit 4d3fbd12a) — localStorage per-chatId, debounced 300ms save, 10KB cap, LRU 20 chats, wired into `chat-send.ts` (clearComposerDraft on send, flushComposerDraft on send path) and `world.ts` (flush on chat switch, restoreComposerDraft on select). `// ponytail:` marker added to `chat-drafts.ts` module doc (server sync deferred). Reply-context AC is inapplicable: `chat-send.ts:45-46` resolves reply target implicitly at send time from `messages.findLast()` — there is no client-side reply-target state to persist; grep across `src/frontend/alpine/` confirms no `setReply`/`replyTo`/`_reply` field exists. Text restore and send-clear both verified.
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

**Resolved:** 2026-10-03 registry-driven close: git issue 81cda3c (registry tip: fa0ab1e7b Konstantin Fedotov Auto-closed: appended .md marker marks TASK-COMPOSER-DRAFT-PERSISTENCE )
