<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Inconsistent DB handle in migration.ts npc_states write

**Status:** Not Started
**Priority:** low
**Effort:** Medium

**Summary:**

The npc_states update (src/rpg/world-travel/migration.ts:122) uses the raw db handle while every other query in the module uses travelDb(db). Impact: None today but breaks the module's convention. Fix: Change db to handle at line 122.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
