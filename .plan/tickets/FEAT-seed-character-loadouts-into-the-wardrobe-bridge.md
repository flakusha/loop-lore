<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# FEAT: Seed character loadouts into the wardrobe bridge

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

character.yaml loadouts[] is typed everywhere (config/sections/templates.ts:212, sections/characters/types.ts:66, schema-class/json-schema/templates.ts:29, defaults.ts:66-78) and documented in configs/templates/character.example.yaml but never written. Convert it at seed time (src/characters/seed/templates.ts) into wardrobe_items rows + actor_wardrobe bindings for equipped actor_items whose id/name contains item_match, gated by the existing wardrobe_loadout_bridge flag (admin/config.ts:192), so wardrobe/resolve.ts:153-158 rung 3 resolves for config-seeded characters without manual binding at routes/wardrobe-bindings.ts:61. Evidence: .plan/configs-templates-wiring-audit.md §2, §4 F1.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
