<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: 2D world: click-to-move + prediction/reconcile + proximity-to-chat

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** XL
**Epic:** epic-2d-sprite-world
**Summary:** Click-to-move with client prediction + server reconcile; proximity docks existing chat panel.
**Context:** Epic epic-2d-sprite-world, first playable slice; server validates zone adjacency (connections) + qualification gates; snapshots event-driven.
**Acceptance Criteria:** Two clients converge after reconcile; proximity opens group chat with co-travelers.

## Summary

Click target -> server validates zone adjacency (connections) + qualification gates -> hot x/y in sim memory, event-driven snapshots (zone_change/arrival/interaction). Client predicts between snapshots, reconciles on SSE. Proximity opens/docks existing chat panel (group chat = co-travelers). Char actions animate sprites. AC: two clients see consistent positions after reconcile.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
