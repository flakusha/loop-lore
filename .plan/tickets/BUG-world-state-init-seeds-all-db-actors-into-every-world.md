<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: world-state init seeds all DB actors into every world

**Status:** ✅ Resolved
**Priority:** high
**Effort:** Medium

## Summary

src/story/world-state/init.ts initializeNpcStates:19-55, initializeCharacterWorldSetup:62-98, seedStartingInventory:110-158 select ALL actor_type character/narrator + agent_type ai/npc DB-wide with no world filter -> creating a world + initialize-states taints it with every NPC in the instance. Fix: filter by world membership/ownership.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

world-state/init.ts initializeNpcStates + initializeCharacterWorldSetup now innerJoin world_members scoped to the target world — new worlds no longer tainted with every DB character/narrator. (resolved 2026-09-06)
