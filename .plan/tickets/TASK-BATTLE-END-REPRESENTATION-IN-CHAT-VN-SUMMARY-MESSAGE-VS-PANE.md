<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Battle end representation in chat/VN: summary message vs panel state

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Decides how an entire battle is represented in chat/VN once resolved. Today: each /attack and /battle start/end emits a systemMessage (start banner, Combat over line, Battle ended) inside the normal message stream, battle.log persists per-action entries, the panel renders the log scrollbox - there is NO generated summary message, NO expandable/collapsible summary card, NO post-battle VN beat. Decide: (a) end-of-battle summary message content (rounds, victor, XP granted via rewards leg, loot) + generator (deterministic template vs LLM summary of battle.log), (b) expand-in-place UX (collapsed summary with click-to-expand full log) vs current always-visible log panel, (c) VN overlay treatment (choice-card style result card vs chat-only line). Blocks implementation.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

Imported from git issue aeb002e.

git issue: aeb002e
