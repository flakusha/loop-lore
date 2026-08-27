<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: AI Actor Processing State Integration (Turn Scheduler)

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Large
**Labels:** turning, group-chat, seen
**Epic:** epic-message-seen-state

## Summary

Wire the turn scheduler so an AI character's `message_seen` row transitions to `Processing` when it is admitted to process a message (rate-limit / batch planning) and to `Seen` when it responds — fulfilling "begun processing as per rate limiting and batch planning".

## Current State

- `src/turning/turn-manager/{lifecycle,state,participants,selection}.ts` owns AI actor turn admission and lifecycle.
- `src/group-chat/` (mention-parser, turn-selector) drives multi-actor turn selection.
- Rate-limit / batch planning gates which AI actor may act and when (`epic-api-rate-limiting`).
- The seen ledger (`message_seen`, `actor_id`) is the target state store (see `TASK-message-seen-state-schema`).

## Change

- In the turn-manager lifecycle, when an AI actor is **admitted** to process a message (rate-limit/batch window opens), upsert its `message_seen` row for that message with `state = "processing"` (+ `seen_at`).
- When that actor **emits its response** (or the turn completes), set `state = "seen"`.
- No double-transition when the same actor is re-admitted for a continuation; respect the `messageSeenStateMachine` transitions.
- Human users remain marked `seen` via the API (`TASK-message-seen-state-service-route`); this ticket owns only AI actors.

## Acceptance Criteria

- [ ] AI actor's `message_seen` row → `Processing` exactly when admitted by the scheduler (rate-limit/batch gated).
- [ ] → `Seen` when its response is produced.
- [ ] Re-admission for continuation does not corrupt state (idempotent upsert).
- [ ] Respects rate limits (no off-schedule transitions).
- [ ] Unit test in `src/turning/` asserting the lifecycle→seen-state mapping.
- [ ] `bun run check` green.
