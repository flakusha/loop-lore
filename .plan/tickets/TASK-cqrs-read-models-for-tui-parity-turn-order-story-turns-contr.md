<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: CQRS read models for TUI parity (turn-order, story-turns contracts)

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-terminal-ui
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

DDD recommendation 6 (Low-Medium impact, Low risk). Stable query endpoints/read models for turn-order, story-turns; document contracts for Rust TUI. Avoid full CQRS until needed. Frontend/TUI depend on route shapes today; service contracts not versioned; parity depends on stable application-service contracts, currently leaky (per DDD index client-parity note; api-contract.test.ts exists as precedent). Keep anemic models acceptable short-term (rec 7: prioritize service extraction + invariants over rich entities, no big-bang rewrite); defer domain aggregates/value objects (rec 2: Chat/ModerationAction/NsfwRating classes with invariants + Kysely mappers) until services extracted — recorded here as the explicit deferral, not a separate ticket.

Owner: epic-terminal-ui (consumer of the contracts) + epic-architecture.

Acceptance: versioned read-model contracts for turn-order + story-turns documented; TUI api-contract tests cover them; no full CQRS machinery; rec 2 aggregates explicitly deferred until rec 1 lands.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
