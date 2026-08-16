<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Expedition Teams & Collaborative Exploration

**Priority:** Medium
**Status:** ⬜ Not Started
**Epic:** epic-exploration-discovery
**Tags:** exploration, expedition, team, collaboration, mapping

## Description

Add expedition team mechanics to the Exploration & Discovery epic — players can form exploration parties, share map discoveries, and tackle dangerous zones together. Extends solo exploration into cooperative and competitive group exploration.

## How It Extends Existing Work

Builds on the Exploration & Discovery epic's map system, fog of war, and discovery rewards. Adds team-based exploration mechanics and shared discovery on top of the existing solo exploration system.

## Acceptance Criteria

- [ ] Expedition team creation (2-5 players per team)
- [ ] Shared fog of war — team members see each other's discoveries
- [ ] Expedition objectives (explore region, find artifact, map uncharted territory)
- [ ] Team-based discovery rewards (split or vote on loot)
- [ ] Expedition risk system — dangerous zones require coordinated teams
- [ ] Expedition history — log of past expeditions and discoveries
- [ ] `POST /api/exploration/expeditions` — create/join an expedition
- [ ] `GET /api/exploration/expeditions/:id` — expedition details
- [ ] Frontend expedition lobby with map and team roster
- [ ] Frontend shared discovery map (team-visible fog of war)

## Technical Notes

- Expedition teams use existing party/group infrastructure where possible
- Shared fog of war is a union of all team members' revealed tiles
- Expedition objectives stored as structured goals with completion conditions
- Integrates with World & Locations epic for region definitions
