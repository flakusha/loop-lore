<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Rare Material Discovery & Crafting Competitions

**Priority:** Medium
**Status:** ⬜ Not Started
**Epic:** epic-crafting-professions
**Tags:** crafting, discovery, rare-materials, competition, gathering

## Description

Add rare material discovery mechanics to the Crafting & Professions epic — hidden material nodes, seasonal spawns, and crafting competitions where players race to create the best item. Makes gathering and crafting more dynamic and rewarding.

## How It Extends Existing Work

Builds on the Crafting & Professions epic's disciplines, recipes, stations, and profession progression. Adds discovery and competition layers on top of the existing gathering and crafting systems.

## Acceptance Criteria

- [ ] Rare material spawn system (hidden nodes, seasonal, world-event tied)
- [ ] Material rarity tiers (Common → Mythic) with visual indicators
- [ ] Crafting competition events (time-limited challenges with prizes)
- [ ] Competition leaderboard and prize distribution
- [ ] Discovery journal — track found materials and locations
- [ ] `GET /api/crafting/rare-materials` — list available rare spawns
- [ ] `POST /api/crafting/competitions` — create/join a competition
- [ ] Frontend discovery map showing rare material locations
- [ ] Frontend competition panel with timer and submissions

## Technical Notes

- Rare material spawns use weighted random tables per world/region
- Competition entries stored with timestamp, materials used, and result
- Discovery journal persists across sessions (ties to World Persistence epic)
