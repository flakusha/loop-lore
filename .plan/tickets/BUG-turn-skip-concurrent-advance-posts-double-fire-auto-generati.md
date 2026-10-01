<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Turn-skip concurrent advance POSTs double-fire auto-generation

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-actor-turn-skip.md
**Tags:** turn-skip

**Summary:** turn skip concurrent advance posts double fire auto generati
**Context:** Context: 93e957dd4/36c26b1e2.
**Acceptance Criteria:** serialize check+insert per (chat, actor) in a BEGIN IMMEDIATE transaction or short-lived idempotency reservation.

## Summary

Context: 93e957dd4/36c26b1e2. Severity: high. recordTurnSkip (chat/service/crud/turn-skip.ts:70-163) guards dedup by reading the latest message, then INSERTs — idempotency_key is not UNIQUE (documented L11-15). Two concurrent POSTs both pass the guard, both insert, both return deduped:false; turn-skip-routes.ts:73-85 fires triggerAutoGeneration twice for mode=advance → double LLM spend. 10/min limiter does not dedupe simultaneous requests. Fix: serialize check+insert per (chat, actor) in a BEGIN IMMEDIATE transaction or short-lived idempotency reservation.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated


## Verification Notes (2026-10-01)

Re-verified against current `dev`; the defect this ticket describes is
already fixed. The ticket was left open past the fix.

Evidence: `src/routes/chats/turn-skip-routes.test.ts:155-166`

- A test fires two simultaneous `mode=advance` posts and asserts the insert and the generation trigger each happen once; it names this ticket.
