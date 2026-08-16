<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Guild & Social Organization System

**Priority:** Medium
**Status:** ⬜ Not Started
**Epic:** epic-social-interaction
**Tags:** guild, organization, social, roles, permissions

## Description

Add a guild and social organization system on top of the Social Interaction epic — players can form guilds, assign roles, set permissions, and participate in guild-wide activities. Extends social interaction from individual to group-level mechanics.

## How It Extends Existing Work

Builds on the Social Interaction epic's social skills, persuasion, and reputation systems. Adds guild-level organization and group dynamics on top of individual social mechanics.

## Acceptance Criteria

- [ ] Guild creation with name, description, emblem, and charter
- [ ] Role-based permissions (Leader, Officer, Member, Recruit)
- [ ] Guild membership management (invite, accept, kick, promote)
- [ ] Guild bank (shared item/currency storage)
- [ ] Guild chat channel (separate from world chat)
- [ ] Guild reputation with factions/worlds
- [ ] Guild events (raids, competitions, meetings)
- [ ] `GET/POST/PUT/DELETE /api/guilds` routes
- [ ] `GET/POST /api/guilds/:id/members` routes
- [ ] Frontend guild management panel
- [ ] Frontend guild chat widget

## Technical Notes

- Guild roles stored as JSON array on guild record with permission bitmask
- Guild chat uses existing chat infrastructure (Epic 36) with guild-scoped routing
- Guild reputation integrates with existing faction/reputation system (Epic: Faction & Reputation)
