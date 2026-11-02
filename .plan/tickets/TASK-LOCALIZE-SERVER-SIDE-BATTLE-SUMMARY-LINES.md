<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Localize server-side battle summary lines

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Deferred followup to battle-panel i18n (commits 84aa3112a, 1364db35e localized all client aria-labels + summary toggle). buildBattleSummary lines (headline, Rounds/Fallen meta) posted as chat systemMessage stay English. CAVEATS: CommandContext carries no t/locale; no assistant command localizes chat text today, so battle-alone localization yields mixed-locale chat; history is English-first. Requires cross-cutting locale plumbing through the assistant command path first, then the 3 call sites: rpg/service/battles/actions.ts (victory leg), assistant/commands/attack.ts, assistant/commands/battle.ts (abandon path).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
