<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: turn_skip Cascade Integration

**Status:** open
**Priority:** high
**Effort:** Medium (cascade wiring + slot release + beat budget)
**Summary:** Cascade integration of the `turn_skip` event across the system: group-chat slot release when all actors pass, solo-chat beat-budget bookkeeping, and the `filterPassedActors` promotion. Builds on `TASK-turn-skip-event` rather than greenfield.
**Context:** Referenced by `epic-actor-turn-skip.md` Work Item list as `TASK-turn-skip-cascade` (line 68) and Concrete Implementation table row 3 (line 122). Listed as `TBD — needs filing` in the gap-audit (2026-09-23). The cascade is the second foundational layer — once the event exists, the cascade turns it into system-wide effects (slot release, beat bookkeeping). Gate interlock and composer UI both depend on it.

**Acceptance Criteria:**
- [ ] Group-chat slot release: when every active actor posts a `turn_skip` event, the chat advances to the next round (or closes if no further actors remain).
- [ ] Solo-chat beat budget: `turn_skip` consumes one beat from the active actor's per-chat budget; the budget gate (`TASK-turn-skip-gate-interlock`) reads the post-cascade state.
- [ ] `filterPassedActors` promotion: the existing `[PASS]` convention is migrated to read from the `turn_skip` event log; no parallel state.
- [ ] Idempotency: posting the same `turn_skip` twice is a no-op (dedup by `actorId + chatId + timestamp`).
- [ ] Telemetry: `cascade.slot.released`, `cascade.beat.consumed`, `cascade.dedup.skip` events.
- [ ] Unit + integration tests cover: group-chat slot release, solo beat bookkeeping, idempotency, and the `[PASS]`-migration path.
- [ ] `bun run check` green.

**Epic:** epic-actor-turn-skip
**Tags:** turn-skip, cascade, slot-release, beat-budget, group-chat, solo-chat, filterPassedActors
**Related:** TASK-turn-skip-event, TASK-turn-skip-gate-interlock, TASK-turn-skip-composer-ui, epic-actor-turn-skip.md:68


git issue: ff44a6e
