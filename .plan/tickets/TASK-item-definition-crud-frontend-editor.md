<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Item Definition CRUD Frontend Editor

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

**Summary:** (see ## Summary below)
**Context:** (see ## Summary — same block)
**Acceptance Criteria:** (see ## Acceptance Criteria below)
**Epic:** epic-items-economy-crafting

## Summary

Build item definition create/edit form on the world-edit page. Reuse existing src/routes/story-items/definitions.ts (POST/PUT/DELETE /api/worlds/:worldId/items). New partial src/views/partials/item-definition-editor.html: form fields for name, description, category (ItemCategory enum dropdown), rarity (ItemRarity dropdown), stackable toggle, max_stack, weight, value (gold), properties JSON. Submit via htmx hx-post. List view (htmx hx-get) below the editor. Tests: src/routes/story-items/handlers.coverage.test.ts already covers BE; add minimal view smoke test. Epic: epic-items-economy-crafting.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
