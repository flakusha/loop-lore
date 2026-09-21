<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: World state machine as motivation/goal context modifier

**Summary:** No world state machine exists (War/Festival/Plague/Famine appear only as market price-table rows in docs/spec/rpg-mechanics.md). Define a world state machine and use it as context for Motivation entries: War amplifies fear motivations, Festival amplifies bond motivations, Plague/Famine drain vitals; character goal motivations become cross-referenceable with faction goals so completing a faction goal can satisfy a character goal.
**Context:** Biggest planning gap found in the 2026-09-21 world-side review. Sits between epic-world-diplomacy-karma.md WorldStateEvolution fragments, world_states table, and timeline conditions JSON (src/story/timeline/event-steering.ts already persists conditions).
**Acceptance Criteria:** World state enum + transition rules persisted per world; Motivation.context resolution consults current world state (effective strength modifier); faction-goal ↔ character-goal satisfaction check; state transitions emit timeline events; prompt section reflects state-modified motivations; unit tests for each state's motivation modifier.

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Large

**References:**
- Epic: .plan/epics/epic-character-world-integration.md
- Adjacent: docs/spec/rpg-mechanics.md market event table, .plan/epics/epic-world-diplomacy-karma.md, src/story/timeline/event-steering.ts
- Depends on: TASK-shared-character-domain-models

**Branch:** open on dev.
