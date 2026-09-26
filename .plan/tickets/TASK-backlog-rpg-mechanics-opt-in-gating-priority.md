<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: backlog — schedule RPG Mechanics Opt-in Gating (safety-first before new mechanics)

**Status:** open
**Priority:** high
**Effort:** Small
**Type:** Task
**Summary:** The 11-issue RPG mechanics opt-in cluster (open-untriaged.md § New clusters) is safety-relevant: the gating ticket (f2b98e3 gate-chat-commands-behind-world-opt-in) must land before any new RPG mechanics ship. This ticket captures the batch and pins the execution order.
**Context:** Per open-untriaged.md § Suggested home and priority-p6.md § P6 sequencing, the gating ticket is severity-first because un-gated chat commands running in non-RPG chats is a behavior surface. The cluster is bounded under existing epic-mechanics-governance.md (per open-untriaged.md § 2026-09-25, no new epic justified).

## Issues in scope (execution order)

| Order | Git issue | Topic | Existing ticket / epic |
| --- | --- | --- | --- |
| 1 | f2b98e3 | gate chat commands behind world opt-in | TASK-rpg-gate-chat-commands-behind-world-opt-in.md |
| 2 | e98ab7f | per-mechanic config | TASK-rpg-per-mechanic-opt-in-config-worldmechanicsconfig-schema-s.md |
| 3 | d5506a5 | unify roll RNG | TASK-rpg-unify-roll-rng-onto-crypto-dice-engine-log-history.md |
| 4 | f26f456 | /check breakdown | TASK-rpg-check-chat-command-with-modifier-breakdown.md |
| 5 | 6629f0d | actor-resolved checks | TASK-rpg-actor-resolved-skill-checks-from-character-sheets.md |
| 6 | a8442ec | pure ability checks | TASK-rpg-pure-ability-checks-outside-combat.md |
| 7 | c29e560 | level-up flow | TASK-rpg-level-up-application-flow-xp-to-levels.md |
| 8 | 83e9718 | world ruleset templates | TASK-rpg-world-ruleset-templates-applied-at-creation.md |
| 9 | 4c37f99 | timed conditions | TASK-rpg-timed-conditions-buffs-with-stat-deltas.md |
| 10 | baf7d71 | history-committing chats | TASK-rpg-history-committing-chats-per-world.md |
| 11 | 1dd08b9 | ruleset enforcement | TASK-rpg-ruleset-enforcement-in-prompts-and-post-generation.md |

**Acceptance Criteria:**

- [ ] f2b98e3 lands first; verified by running a /check command in a non-RPG chat and confirming it is rejected with a clear message.
- [ ] Each of the 11 git issues linked (body or comment) to its existing ticket.
- [ ] index.json updated via plan:sync:fix; no duplicate epic created.
- [ ] Suggested home documented in epic-mechanics-governance.md § Execution order.

**Tags:** rpg, mechanics, opt-in, gating, safety
**Related:** .plan/backlog/open-untriaged.md § New clusters, .plan/epics/epic-mechanics-governance.md, .plan/tickets/TASK-rpg-gate-chat-commands-behind-world-opt-in.md


git issue: aadf424
