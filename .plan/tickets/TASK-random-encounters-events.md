<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Random Encounters & Random Events Generation

**Priority:** Medium
**Status:** 🟡 Partial — basic generator wired into generation pipeline; encounter tables + event chains pending
**Epic:** epic-world-event-system
**Tags:** random, encounter, event, generation, ambient, dynamic

## Description

Add comprehensive random encounter and random event generation on top of the World Event & Timeline System. Creates stochastic, dynamic events that occur during exploration, travel, and downtime. Extends the local random event generator with encounter tables, event chains, and severity scaling.

## How It Extends Existing Work

Builds on the World Event & Timeline System (TASK-world-event-system.md) and the local random event generator (existing in Crafting/Memory epic). Adds structured encounter tables, event chains, and severity scaling on top of the existing stochastic event injection.

## Acceptance Criteria

- [ ] Encounter tables per region/biome (weighted random selection)
- [ ] Event chains — sequential events that build on each other
- [ ] Severity scaling (trivial → minor → moderate → major → catastrophic)
- [ ] Downtime events (tavern rumors, market fluctuations, weather changes)
- [ ] Travel encounters (road ambushes, bandit camps, mysterious travelers)
- [ ] Exploration encounters (hidden treasures, ancient ruins, creature lairs)
- [ ] Combat encounters (enemy patrols, monster attacks, boss appearances)
- [ ] Social encounters (NPC meetings, faction interactions, festivals)
- [ ] Event rarity system (common, uncommon, rare, legendary)
- [ ] `GET /api/worlds/:id/encounters` — list available encounters for a region
- [ ] `POST /api/worlds/:id/encounters/generate` — trigger a random encounter
- [ ] Frontend encounter notification with severity indicator
- [ ] Frontend encounter log (history of past encounters)
- [ ] Config: encounter frequency, rarity weights per world

## Technical Notes

- Encounter tables use weighted random selection per region/biome
- Event chains are stored as directed graphs with trigger conditions
- Severity scaling affects LLM prompt context and NPC response intensity
- Integrates with World & Locations epic for region/biome definitions
- Integrates with Weather & Environment epic for weather-related encounters
- Integrates with Battle Action Systems for combat encounters
- Uses existing hook system for event injection into chat context

## Chat Audit 2026-08-25 — Cross-Reference

**Finding B5:** `src/chat/proactive/*` and `src/chat/random-events.ts` are skeletal — event lifecycle and persistence logic missing/stagnant; needs completion before random/proactive events are reliable.

_Source: chat functionality audit (loop-lore), 2026-08-25. Related umbrella ticket for asset-injection feature: TASK-show-assets-scenes-worlds-items-to-character-via-chat-contex (issue afe0589)._
