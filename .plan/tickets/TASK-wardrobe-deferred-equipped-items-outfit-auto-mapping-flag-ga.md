<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Wardrobe deferred: equipped-items -> outfit auto-mapping (flag-gated)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Status Note:** completed 2026-10-01 — flag `system_config.wardrobe_loadout_bridge` default off; read-side rung, no equip-time writes
**Priority:** low
**Effort:** Large
**Epic:** epic-wardrobe-avatar-variants

## Summary

Deferred phase: equipped-items -> outfit auto-mapping (flag-gated). Map equipped RPG items to outfit descriptor (equip plate armor -> armor look). Keep decoupled from inventory initially — manual outfit switch first; equip-driven automatic switch behind a flag. Acceptance: flag OFF preserves manual behavior; flag ON auto-switches on equip with deterministic mapping.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
