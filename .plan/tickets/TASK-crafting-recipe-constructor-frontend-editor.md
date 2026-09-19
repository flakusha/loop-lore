<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Crafting Recipe Constructor Frontend Editor

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

**Summary:** (see ## Summary below)
**Context:** (see ## Summary — same block)
**Acceptance Criteria:** (see ## Acceptance Criteria below)
**Epic:** epic-items-economy-crafting

## Summary

Add crafting recipe constructor UI for world authors. Reuse existing src/routes/crafting.ts (POST /api/rpg/crafting/recipes) and src/rpg/crafting/orders.ts. New partial src/views/partials/crafting-recipe-editor.html: recipe name, station type (CraftingStationType dropdown), inputs (list of item IDs + quantities), outputs (item ID + quantity), success chance. htmx save. Tests: existing in src/rpg/crafting/process.test.ts; add view smoke test. Epic: epic-items-economy-crafting.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
