<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Battle trigger design: opt-in reasons, no-reason guard, story/intent triggers

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Consolidates the 7 confirmed battle-entry questions from research. Decides: (1) battle is opt-in (world rpg_combat flag + template features), reasons required to trigger - enumerate the reason set (owner /battle start, /attack inside roster context, encounter roll outcome, GM story beat, skill-check consequence). (2) triggering battle without a reason must be rejected - define denial copy + standings impact (no XP, no ledger, no drift when battle never validly starts; invalid start writes nothing). (3) story-development + intent-based triggers - COMBAT_ACTION/COMBAT_DAMAGE regexes exist in src/regex/story-events.ts but have NO consumers; decide detection path (regex pre-gate vs aux-LLM classifier vs encounter roll) and wire or delete. (4) single-action resolution (sneak attack) vs full battle - success path may resolve as 1-turn skirmish (performAttack with over=true) or escalate to full battle; define threshold rule. Blocks implementation.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

Imported from git issue b28e5e4.

git issue: b28e5e4
