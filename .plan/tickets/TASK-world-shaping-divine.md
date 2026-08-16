<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: World-Shaping Player Actions & Divine Intervention

**Priority:** Medium
**Status:** ⬜ Not Started
**Epic:** epic-worlds-extension
**Tags:** world-shaping, divine, player-action, world-change, god-mode

## Description

Add world-shaping player actions and divine intervention mechanics to the Worlds Extension epic — players can alter the world itself through actions, and god-like entities can intervene in world events. Extends the world system from a static backdrop to a dynamic, player-malleable environment.

## How It Extends Existing Work

Builds on the Worlds Extension epic's mode-switching and world layers. Adds player-driven world alteration and divine intervention on top of the existing world infrastructure.

## Acceptance Criteria

- [ ] World-shaping actions (raise mountains, change rivers, create forests)
- [ ] Divine intervention system (god-like entities that affect the world)
- [ ] World-altering events with persistent consequences
- [ ] Player alignment tracking (benevolent, neutral, destructive)
- [ ] World state snapshots (before/after major changes)
- [ ] `POST /api/worlds/:id/actions` — execute a world-shaping action
- [ ] `GET /api/worlds/:id/alignment` — check player alignment
- [ ] Frontend world-shaping tool UI
- [ ] Frontend divine intervention panel
- [ ] Frontend world state comparison (before/after)

## Technical Notes

- World-shaping actions are high-cost, high-impact events
- Divine intervention uses the existing hook system (src/generation/hooks/) for event triggering
- Alignment tracking integrates with existing reputation/faction system
- World state snapshots use the existing persistence layer (Epic: World Persistence & Sync)
- World-shaping actions are GM-gated by default (configurable per world)
