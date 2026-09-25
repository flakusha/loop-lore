<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: turn_skip Event + Persistence

**Status:** open
**Priority:** high
**Effort:** Medium (event schema + API route + persistence + context-assembly rendering)
**Summary:** The `turn_skip` event — schema, persistence layer, API route for posting skips, and context-assembly rendering so the rest of the system (group-chat slot release, solo beat budget, gate interlock, composer UI) sees a consistent event stream.
**Context:** Referenced by `epic-actor-turn-skip.md` Work Item list as `TASK-turn-skip-event` (line 64) and Concrete Implementation table row 1 (line 120). Listed as `TBD — needs filing` in the gap-audit (2026-09-23). This is the foundational event the rest of the turn-skip subsystem builds on — gate interlock and composer UI cannot ship without it.

**Acceptance Criteria:**
- [ ] Event schema: `actorId`, `chatId`, `kind: 'hold' | 'advance'`, `timestamp`, `reason?: string`, with validation in the API route.
- [ ] Persistence: every `turn_skip` is stored as a chat message of a dedicated type, retrievable by `chatId + timestamp`.
- [ ] API route: POST `/api/chats/:chatId/turn-skip` with rate-limiting (per-user + per-chat), JSON body validation, and the typed response envelope.
- [ ] Context assembly: the turn-skip event renders in chat context as a system line, distinct from user/assistant messages.
- [ ] Cascade integration: `filterPassedActors` (the existing [PASS] convention) is promoted to the `turn_skip` event — no parallel tracking path.
- [ ] Unit + integration tests cover: schema validation, persistence round-trip, rate-limit enforcement, context-assembly rendering, and cascade integration.
- [ ] `bun run check` green.

**Epic:** epic-actor-turn-skip
**Tags:** turn-skip, event, persistence, context-assembly, api, schema, cascade
**Related:** TASK-turn-skip-cascade, TASK-turn-skip-gate-interlock, TASK-turn-skip-composer-ui, epic-actor-turn-skip.md:64


git issue: 906dfec
