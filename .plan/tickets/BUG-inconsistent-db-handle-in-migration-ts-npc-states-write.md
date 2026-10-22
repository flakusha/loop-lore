<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Inconsistent DB handle in migration.ts npc_states write

**Status:** Done
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

**Resolved:** 2026-10-22 registry-driven close: git issue dfcf59f (registry tip: f579a5ddf Konstantin Fedotov Auto-closed: appended .md marker marks BUG-INCONSISTENT-DB-HANDLE-IN-MI)
