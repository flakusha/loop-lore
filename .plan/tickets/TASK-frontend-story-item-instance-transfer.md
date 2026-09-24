<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend — Story Item Instance Transfer

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** P1 — High
**Effort:** Small
**Epic:** epic-item-systems-unification
**Related:** TASK-trade-history-npc-counterparty
**Source:** FE-BE harmonization check, 2026-09-17 — 1 route in this slice.

## Summary

Wire the per-item-instance transfer endpoint (POST) so actors can move story items
between containers/actors from the UI.

## Backend surface

| Method | Path | File |
|--------|------|------|
| POST | `/api/worlds/:worldId/item-instances/:instanceId/transfer` | `src/routes/story-items/instances.ts:113` |

## Acceptance Criteria

- [ ] Inventory/character-sheet panel exposes "Transfer" action per item
- [ ] Modal collects target actor/container
- [ ] POST submits transfer; UI updates after success
- [ ] Owner/actor-only gate surfaced in UI
- [ ] `bun run check` green
