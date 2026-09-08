<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Item generation review parity: extract category/rarity/stats, preview them, accept confirm overrides

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Assistant /create item shares the gated pipeline (src/assistant/commands/create.ts + quality/entity-creation.ts + POST /api/chats/:id/create-entity) but item drafts are second-class: insertGeneratedEntity (src/assistant/commands/create-entity.ts:139-158) hardcodes category=other, rarity=common, stackable=unique, value=0, weight=1; the item prompt (src/assistant/prompt/templates/entity-generation.ts:40-41) asks only for name+description; the preview (create.ts:162-171) renders no item fields. Reuse the world/location/character review logic for items: extend the item prompt to extract category/rarity/stat hints, extend GeneratedEntity schema + validateEntitySchema per-kind checks, render item fields in the preview, and accept user-corrected category/rarity via the create-entity-preview payload through the confirm endpoint. Scope: character/location/world paths untouched. Acceptance: /create item preview shows category/rarity; confirm persists user-approved values, never silent defaults; unit tests for item schema gate + confirm override.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
