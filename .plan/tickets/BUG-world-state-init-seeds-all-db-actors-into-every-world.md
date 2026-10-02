<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: world-state init seeds all DB actors into every world

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** high
**Effort:** Medium

## Summary

src/story/world-state/init.ts initializeNpcStates:19-55, initializeCharacterWorldSetup:62-98, seedStartingInventory:110-158 select ALL actor_type character/narrator + agent_type ai/npc DB-wide with no world filter -> creating a world + initialize-states taints it with every NPC in the instance. Fix: filter by world membership/ownership.

## Acceptance Criteria

- [x] `initializeNpcStates` + `initializeCharacterWorldSetup` (`src/story/world-state/init.ts:20,66`) scope via `innerJoin world_members` filtered to the target `world_id` — verified at HEAD
- [x] `seedStartingInventory` (`src/story/world-state/init.ts:117`) scopes setups + item defs to the target `world_id`
- [x] Regression pinned: `src/story/world-state/init.coverage.test.ts` (world-scoped seeding, empty world, FK-violating id) + `src/characters/world-setup/service.test.ts` (idempotent seed hook)
- [x] Cross-world isolation by construction: both seed entry points filter on `world_members.world_id = worldId`, so actors joined only to world A are invisible to a world-B seed pass

## Resolution

world-state/init.ts initializeNpcStates + initializeCharacterWorldSetup now innerJoin world_members scoped to the target world — new worlds no longer tainted with every DB character/narrator. (resolved 2026-09-06)
