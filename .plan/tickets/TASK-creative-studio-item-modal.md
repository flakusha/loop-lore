<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Task: Item Detail Modal

**Epic:** epic-creative-studio.md (MVP Tier 1)
**Status:** ⬜ Not Started
**Effort:** Low
**Depends On:** —

## Goal

Modal for viewing and editing items in Creative Studio.

## Acceptance Criteria

- [ ] Modal opens on click from search results
- [ ] Shows item details: name, description, type, equip state, quantity
- [ ] Edit form for item fields
- [ ] Link to world context (if story item)
- [ ] Dev mode: show item state JSON

## Implementation

- Alpine.js modal component
- htmx for form submission
- Integrate with `GET/PATCH /api/actors/:actorId/items/:itemId`

## Files to Create/Modify

- `src/frontend/creative-studio/modals/item-modal.ts` (new)
