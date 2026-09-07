<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RPG: world ruleset templates applied at creation

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-mechanics-governance.md

## Summary

Gap G9 (verified): zero ruleset refs in src/; handleCreateWorld hardcodes ~10 defaults; WorldBundle import never applied at creation. Add ruleset_templates table (append-only migration) + worlds.ruleset_id; built-in seeds (d20-gritty, narrative-freeform, lore-strict-canon) with mechanics flags + difficulty + allowed checks + lore-strictness; templateId in POST /api/worlds; custom templates CRUD; bundle export includes ruleset_id. Plan doc batch 3 #9. Epic: epic-mechanics-governance.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
