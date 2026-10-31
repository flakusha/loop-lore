<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Equipment Slots

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** P1 — High
**Effort:** Medium
**Type:** Feature Task
**Tags:** inventory, frontend, ui, equipment
**Epic:** epic-inventory-ui

## Summary

Equipment loadout display.

## Core Features

- Slot visualization
- Equipped item display
- Stat bonuses
- Quick equip/unequip

## Acceptance Criteria

- [ ] Equipment slot visualization
- [ ] Equipped item display
- [ ] Stat bonus display
- [ ] Quick equip/unequip
- [ ] Mobile responsive

## Files to Create

- `src/frontend/inventory/equipment-slots.ts`
- `src/frontend/inventory/equipment-slot.ts`

## Resolution (2026-10-30)

Shipped as Phase 2 equip/unequip + `loadEquipped` state in
`src/frontend/alpine/inventory.ts` (commit `fc0632578`). The standalone
`src/frontend/inventory/equipment-slots.ts` DOM renderer was later pruned as
dead in `1e5d648f3` — the live path is the Alpine-templated
`src/components/inventory-panels.html`.

**Resolved:** 2026-10-30 shipped: equipment loadout on dev (`fc0632578`); standalone `equipment-slots.ts` DOM renderer pruned as dead (`1e5d648f3`).
