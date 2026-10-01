<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# IDEA: 2D world: RAG/business-process mapping spike

**Status:** Done
**Priority:** low
**Effort:** Small
**Epic:** epic-2d-sprite-world
**Summary:** Time-boxed evaluation of game-to-business-process mapping; report only.
**Context:** Epic epic-2d-sprite-world RAG/biz follow-up; candidate mapping locations=zones, actors=agents, events=signals.
**Acceptance Criteria:**
- [x] Written evaluation delivered
- [x] Verdict recorded: defer pending 2D world MVP + quest/plot system

## Summary

Evaluate locations=zones, actors=agents, events=signals mapping for game-based business processes. Time-boxed spike, report only, no implementation.

## Resolution (2026-10-01)

**Verdict: Defer — adopt as a thin research track inside `epic-2d-sprite-world`, not a standalone epic.**

The spike itself is **complete** — this ticket is `Done`, because the written evaluation was delivered and the verdict recorded. What is deferred is the *implementation* of the RAG/business-process mapping, which stays pending the 2D world MVP and the quest/plot system. `Done` refers to the spike's scope only, never to building the mapping.

The mapping `locations=zones, actors=agents, events=signals` holds structurally but its value depends on the game having a meaningful process model to map onto. Loop-lore's current world simulation (locations, NPCs, world events) is a _world-state_ model, not a _process_ model — there is no BPMN-style process graph, no defined actor roles with explicit responsibilities, and no event-driven state-machine with clear transitions. The mapping would require defining that process model first, which is a separate research effort with its own prerequisites.

### Where the mapping holds

| Mapping | Loop-lore subsystem | Fit |
| --- | --- | --- |
| `locations = zones` | `locations` table with `coord_x/y/z`, `LocationTreeService`, zone rects from `epic-2d-sprite-world` | Strong — spatial zones are the natural spatial unit; already named as such |
| `actors = agents` | `npc_states`, `actor_locations`, `npc_states(health, mental_state, knowledge, relationships, inventory, schedule)` | Partial — NPCs are stateful actors, but they are player-authored characters, not process agents. The analogy breaks when player intent diverges from process logic |
| `events = signals` | `WorldEventType` enum (location_change, npc_state_change, item_transfer, combat_event, ...) | Partial — events exist and are named, but they are world facts, not process signals. A signal in BPMN is broadcast and caught by a matching intermediate event; loop-lore's events are logged, not broadcast-and-catch |

### Where the mapping breaks

1. **No process graph.** Business-process maps have explicit sequence flows (A → B → C). Loop-lore's world has spatial topology and NPC schedules, but no defined action-ordering graph. A BPMN `lane` concept (actors assigned to process lanes) has no counterpart.
2. **Actors have agency, not just role.** In a process, an agent executes its assigned tasks deterministically. In loop-lore, an NPC may refuse a task, pursue a personal agenda, or die mid-process. NPC memory retrieval is a memory query, not a process-state read.
3. **Events are broadcast-logged, not caught.** The `WorldEventType` feed is an append-only event log for the player to observe. A BPMN signal is a trigger that activates a specific task. Bridging the two requires defining a signal-matching semantic that does not yet exist.
4. **No process-instance lifecycle.** Business processes have start/end states, milestones, and escalation paths. Loop-lore's world events are unbounded and player-driven.

### Recommendation

Keep this as a low-priority research thread inside `epic-2d-sprite-world` (already listed as Sub-Epic #9 in that epic's Sub-Epics table). Verdict embedded in the Sub-Epics table. Revisit when a world-quest or world-plot epic lands.

## Acceptance Criteria

- [x] Written evaluation delivered
- [x] Verdict recorded: defer pending 2D world MVP + quest/plot system
