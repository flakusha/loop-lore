<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Loot Table Constructor Frontend Editor

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

**Summary:** (see ## Summary below)
**Context:** (see ## Summary — same block)
**Acceptance Criteria:** (see ## Acceptance Criteria below)
**Epic:** epic-items-economy-crafting

## Summary

Add loot table constructor UI for world authors. Reuse existing POST /api/rpg/loot/tables and POST /api/rpg/loot/tables/:id/entries (src/routes/rpg/xp-loot-tables.ts). New partial src/views/partials/loot-table-editor.html: name + minimum_level fields, list of LootEntry rows (item picker from /api/worlds/:worldId/items), save via htmx. Show table preview with rolled output (calls POST /api/rpg/loot/tables/:id/roll). Tests: existing coverage in src/rpg/loot/persist.test.ts; add view smoke test. Epic: epic-items-economy-crafting.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
