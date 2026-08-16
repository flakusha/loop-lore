<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Faction Standing Schema

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Related:** epic-faction-reputation.md, epic-worlds-extension.md, epic-social-interaction.md

## Summary

Design and implement the schema for **factions** and **per-character standing** so worlds
can track reputation that shifts available quests/NPCs and persists in world state
(Undertale-style). Foundation for `epic-faction-reputation.md`.

## Rationale

- MMO template + forum-RP reputation (rpg-landscape.md §6.6, §4.3).
- Non-binary standing (gradations) preferred over ally/foe binary (§6.7).

## Current State

- No faction/standing tables in `src/db/schema*.ts`.
- `epic-social-interaction.md` and `epic-worlds-extension.md` reference factions but
  lack schema.

## Schema sketch

- `factions (id, world_id, name, territory_ref, quest_pool_ref, storyline)`
- `actor_faction_standing (actor_id, faction_id, standing REAL, trend)` — non-binary
- `faction_territory (faction_id, location_ref, control_state)`

## Acceptance

- [ ] Kysely migration for the three tables
- [ ] Standing update on choice/event hooks
- [ ] Query API for gating quests/NPCs by standing
- [ ] Indexed in research cross-reference (rpg-landscape.md §11)
