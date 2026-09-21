<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Composer message queue while generation is in flight

**Status:** Not Started
**Summary:** Queue composer sends while generation is in flight; auto-send sequentially on completion.
**Context:** OpenWebUI message queue (docs features); Neta queued followups (landscape-2026b). Searches `message queue|queued message|type while|composer queue` in `.plan/`: 0 matches; composer-flows epic covers drafts/scheduled only (2026-09-21 refs audit).
**Acceptance Criteria:**
- [ ] Enqueue → completion → sequential auto-send round-trip; survives page reload
- [ ] Queue flush uses normal message-create path (moderation not bypassed)
- [ ] Idempotency: concurrent completion + flush cannot double-send
**Epic:** epic-chat-composer-flows.md
**Type:** Feature | **Priority:** Medium | **Effort:** S

## Problem

OpenWebUI queues messages typed while the model responds (auto-send on completion — docs.openwebui.com/features/); Neta Studio queues followups with per-generation duration shown (`docs/ideas/emergent-platform-landscape-2026b.md` agent-studio changelog notes). Loop-lore's composer has no queue: searches `message queue|queued message|type while|composer queue` across `.plan/` return zero matches; `epic-chat-composer-flows.md` covers forward/drafts/scheduled/reminders but not queue-while-generating (verified 2026-09-21 reference-platform gap audit).

## Change

- While a generation is active, Enter enqueues instead of blocking/discarding; queued messages render as pending chips above the composer (edit/reorder/cancel).
- On generation completion, queued messages send sequentially through the normal message-create path (idempotency keys per `swipe-race-insert` discipline) — no bypass of moderation/profanity pipeline.
- Group chat: queue respects turn orchestration (does not preempt the current actor turn).

## Acceptance

- Type → enqueue → completion → auto-send round-trip; queued message survives page reload (client-persisted draft semantics).
- Concurrent completion + queue flush cannot double-send (idempotency test).

## Non-goals

- Server-side scheduling/cron (epic-cron-scheduler, done); scheduled send (composer-flows sibling scope).
