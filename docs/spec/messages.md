<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Message System

> **Status:** Core persistence implemented; swipe/variant UX and timeline-flatten API aspirational. Authoritative source: `src/db/schema-core.ts` (`Messages`) and `AGENTS.md`.

## Contract (normative)

- Guaranteed persistence: write-ahead save before response, single-transaction message + metadata, WAL crash recovery, no silent drops — failed writes surface as client errors; idempotency key dedupes retries (drafts persisted client-side for reconnect).
- Tree model via `parent_id`: roots (`parent_id IS NULL`), replies, continuations (chained by `continuation_index`, always appended — not forks), swipe variants (siblings on the same parent; client stores the active index).
- Status flow: `sending` → `confirmed`; continue appends (original stays `partial`); regenerate creates a sibling (old → `cancelled`). Failed/partial/rejected messages stay visible — hidden, never silently deleted.

## Implemented

- Schema + DDL — `src/db/schema-core.ts` (`Messages`), `src/db/migrations/001_init.ts`; unified `actor_id` sender; encrypted content with `key_id`; encodings identity/gzip/zstd/brotli; `idempotency_key`.
- Status × visibility composite state machine — `messagesStatusVisibility` (`CompositeValidator`) in `src/db/enums-core/messages.ts` (older citations of `messageCompositeValidator` @ `enums-core.ts:142-168` are stale — the file split into `enums-core/`).
- Config — `MessagesConfig` in `src/config/schema/messages.ts` (autoHideInvalid, maxLength, generation retries/timeout, idempotencyExpiryHours = 24 h; client compress threshold 128 B in `src/frontend/browser.ts`).
- Tree integrity on chat carry (parent remapping) — `src/chat/service/carry-history.ts`.
- Swipe variants — `src/chat/service/read.ts` (variants by parent), route `GET /api/v1/messages/:id/variants`, browse-variants modal `src/components/chat/message-list.html`.

## Not implemented / aspirational

- Active-timeline flatten in list responses (a single active swipe variant per fork) — epic-messages Not Started.
- Detail levels UI (basic/expanded, per-message toggle, token/cost/speed stats); periodic sweep deleting empty cancelled messages.

## Epics

- `.plan/epics/epic-messages.md`; frontend: `docs/frontend/chat/message-bubbles.md` (variant switcher), `docs/frontend/chat/message-actions.md` (regenerate).
