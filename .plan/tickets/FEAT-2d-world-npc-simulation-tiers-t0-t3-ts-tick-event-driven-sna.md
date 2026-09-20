<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: 2D world: NPC simulation tiers T0-T3 (TS tick, event-driven snapshots)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** XL
**Epic:** epic-2d-sprite-world
**Summary:** NPC tiers T0-T3 on TS tick with event-driven snapshots; Rust ECS proposal included.
**Context:** Epic epic-2d-sprite-world; TravelTickEngine precedent for T2; hot x/y in sim memory, no periodic DB writes.
**Acceptance Criteria:** Tiers advance without periodic writes; Rust split boundary documented (movement/economy tick fns).

## Summary

T0 stationary, T1 single-zone wander, T2 travel-route following (TravelTickEngine precedent, deriveForTransport), T3 economy/trade via inventories + item_transfer events. Hot x/y in sim memory; snapshots event-driven only (zone_change/arrival/interaction/combat/manual). Include two-level Rust ECS proposal (boundary: movement/economy tick fns) for later split. AC: tiers advance without periodic DB writes.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
