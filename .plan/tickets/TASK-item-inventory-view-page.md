<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Item Inventory View Page

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

**Summary:** (see ## Summary below)
**Context:** (see ## Summary — same block)
**Acceptance Criteria:** (see ## Acceptance Criteria below)
**Epic:** epic-items-economy-crafting

## Summary

Add actor inventory read-only view to character-edit page. Reuse existing src/story/items/instances.ts getAtLocation + getNpcInventory. New partial src/views/partials/inventory-viewer.html grouped by category (Weapon/Armor/Consumable/etc.) with quantity badge. Submit quantity changes via PUT /api/worlds/:worldId/item-instances (already wired). Drop only — transfer endpoints will be added later. Tests: view smoke test. Epic: epic-items-economy-crafting.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
