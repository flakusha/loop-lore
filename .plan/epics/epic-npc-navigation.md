<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: NPC Navigation

**Status:** 🟢 Code+tests+schema done (migration 001/p07); UNWIRED
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** npc, navigation, ai, pathfinding, movement

## Overview

NPC navigation system — autonomous movement, pathfinding, and location-based behavior for non-player characters. Covers NPC movement patterns, location awareness, travel mechanics, and dynamic world interaction.

## Navigation Systems

### Core Navigation Model

interface NPCNavigation {
}
interface NavigationPath {
}
interface Waypoint {
}
interface MovementPattern {
}
interface LocationAwareness {
}

### Autonomous Movement

interface AutonomousMovement {
}
interface PatrolRoute {
}
interface WanderBehavior {
}
interface FleeBehavior {
}
interface FollowBehavior {
}

### Pathfinding

interface PathfindingResult {
}
interface NavigationMesh {
}
interface ObstacleAvoidance {
}
interface TerrainCost {
}

### Dynamic Interaction

interface LocationEvent {
}
interface NPCEncounter {
}
interface LocationTrigger {
}
interface WorldStateChange {
}

## Key Behaviors

- NPCs move autonomously based on schedules, events, and world state
- Pathfinding considers terrain, obstacles, and NPC capabilities
- Location-based events trigger when NPCs enter/leave areas
- NPCs react to player presence and world changes
- Movement patterns create believable character behaviors
- Travel mechanics support both fast travel and realistic movement

## Dependencies

Autonomy scheduling and budgets for these behaviors: epic-actor-autonomy-story-drive.md (this epic stays movement-execution only).

- `epic-character-core-system.md` (character stats, traits)
- `epic-world-locations.md` (location system)
- `specs/npc-navigation.md` (full design spec)

## Wiring & Resolution Plan (2026-08-08 audit)

`NpcNavigationService` (src/rpg/npc-navigation/, state + movement + processing + pathfinding,
backed by `npc_states` + `location_states`, migration 001/p07) is code-complete + tested but has
ZERO external importers. Resolution: mount it under `/api/rpg/npc-navigation`
(move/pathfind/state) via the WIRED-7 mount pattern — tracked by
`TASK-wire-npc-navigation-routes`.
