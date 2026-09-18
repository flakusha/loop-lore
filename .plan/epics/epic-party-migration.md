<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Party Migration & Travel

**Effort:** Medium
**Type:** epic
**Tags:** (none)
**Overview:** (see sections below)


**Status:** ⬜ Not Started
**Priority:** Low
**Epic ID:** EPIC-2026-34

## Summary

Multi-actor travel, party formation, navigation between locations, and
NPC groups that move as a single traveling entity (caravan, patrol, raid,
trade convoy, hunting party). A party can be player-led (a group chat
traveling together), NPC-led (a wolf pack patrols a forest), or hybrid
(a town guard patrol joined by a player character mid-shift).

This epic expands the previously-stubbed `epic-party-migration.md` into
party formation, party travel, and the navigable location-graph surface
that world simulation, autonomy scheduler, and chat transfer all depend on.

## Scope

- Party formation (player groups, NPC factions, mixed)
- Party membership and membership changes (join/leave/kick)
- Party travel (lockstep step, coordinated arrival, time-aligned chats)
- Party types: caravan, patrol, raid, trade convoy, hunting party, escort
- Mixed parties (player character + bound NPCs)
- NPC group behavior: defend-member, scatter, regroup, surrender-leader
- Location graph: connected/bound/free-travel/fast-travel edges
- Free travel (jump) versus adjacency travel
- Party → chat/branch integration (party moves = chat transfer)
- Party → world-tick integration (party moves consume game-time)
- Per-party schedule and route (patrol routes, trade routes)
- Party economy (shared loot pool, shared currency, per-member split)
- Party-bound NPC minion/guard subsystems (boss + retinue)

## Key Integrations

| System | What It Provides | How This Epic Uses It |
| ------ | ---------------- | --------------------- |
| Chat Transfer & Location Change | Chat join/leave + location transitions | Party moves = simultaneous chat transfer |
| Conversation Branching | Tree-structured message history | Branches merge when parties converge |
| World & Locations | Location grid + travel rules | Party moves use adjacency / fast-travel |
| World NPCs | NPC placement | Party members register as NPCs in motion |
| World Travel & Time | World clock + travel duration | Party travel consumes game-time per edge |
| Time Scale | Compressed real-time → game-time | Party pacing realigned to game-time |
| Time Sync | Time-merge chat branches | Parties wait for stragglers then merge |
| World Simulation | World tick scheduler | Party auto-travel runs on tick |
| Battle & Combat | Combat resolution | Party combat is multi-actor combat |
| Faction & Reputation | Faction standing | Party reputation per-faction aggregate |
| AUX LLM | Fast classification | AUX classifies party events for memory |

## Tasks

- [ ] Party schema (party table + party_member table + party_state) — `TASK-party-schema-crud-routes-and-migration`
- [ ] Party CRUD endpoints (create/disband/member manage) — `TASK-party-schema-crud-routes-and-migration`
- [ ] Party types: caravan, patrol, raid, trade, escort, mixed — `TASK-party-schema-crud-routes-and-migration`
- [ ] Party travel engine (adjacency + fast-travel) — `TASK-party-travel-engine-adjacency-and-fast-travel`
- [ ] Free-travel (jump) edge in location graph — `TASK-party-free-jump-location-graph-edge`
- [ ] Party schedule and route (patrol/trade routes) — `TASK-party-schedule-and-patrol-routes`
- [ ] Party → world-tick integration — `TASK-party-world-tick-and-chat-transfer-integration`
- [ ] Party → chat transfer integration — `TASK-party-world-tick-and-chat-transfer-integration`
- [ ] Party → chat branch merge integration — `TASK-party-chat-branch-merge-on-converge`
- [ ] Party economy (shared loot, currency split, vendor splits) — `TASK-party-economy-shared-loot-and-currency-split`
- [ ] Party-bound NPCs (boss + guards retinue) — `TASK-party-bound-npc-retinue-and-group-behavior`
- [ ] NPC group behavior (defend-member, scatter, regroup) — `TASK-party-bound-npc-retinue-and-group-behavior`
- [ ] Party UI (roster, route, schedule, stats) — `TASK-party-ui-roster-route-schedule-stats`
- [ ] Migration for party + party_member — `TASK-party-schema-crud-routes-and-migration`
- [ ] Party join/leave with VN narration (Phase 1 done 2026-08-19: `joinParty`/`leaveParty`, participant endpoints, `guest` role; open: VN scene-renderer wiring, state snapshot on leave) — `TASK-party-join-leave`

## Design

### Party

```typescript
interface Party {
  id: string;
  worldId: string;
  type: "caravan" | "patrol" | "raid" | "trade" | "escort" | "hunting" | "mixed";
  leaderId: string; // character or NPC id
  memberIds: string[];
  boundNpcIds: string[]; // boss + guards attached to leader
  schedule: PartySchedule;
  route: PartyRoute;
  state: PartyState;
  economy: PartyEconomy;
  createdAt: number;
}

interface PartySchedule {
  startTime: number;
  endTime: number;
  cadence: "continuous" | "scheduled" | "patrol";
  patrolRoute: LocationId[];
  restingLocations: LocationId[];
}

interface PartyRoute {
  edges: LocationEdge[];
  currentLocationId: LocationId;
  destinationLocationId: LocationId | null;
  travelMode: "adjacency" | "fast-travel" | "free-jump";
  estimatedArrivalTick: number;
}

interface LocationEdge {
  from: LocationId;
  to: LocationId;
  mode: "walk" | "ride" | "fly" | "teleport" | "port-gate";
  gameHours: number;
  requiresDiscovery: boolean;
}

interface PartyState {
  status: "forming" | "traveling" | "in-combat" | "resting" | "disbanded";
  combatRoundId: string | null;
  currentTick: number;
  cohesion: number; // 0-100, drops on losses
}

interface PartyEconomy {
  sharedCurrency: number;
  poolItems: ItemInstanceId[]; // shared loot pool awaiting split
  perMemberOwed: Record<string, number>; // accrued shares owed
}
```

### Boss + Retinue (Bound NPCs)

```typescript
interface BoundNpcRetinue {
  bossId: string;
  retinueIds: string[]; // guards, lieutenants, champions
  relationship: "loyal" | "hired" | "coerced" | "cultist";
  defendOnAttack: true; // retinue auto-defends when boss engaged
  scatterOnLeaderDeath: "flee" | "surrender" | "rage";
  minChatAct: "send_message" | "react_emote" | "join_battle";
}
```

## Open Questions

- Party leader death handling: disband, promote, or merge-into-nearest-party?
- Mixed party combat: shared initiative or per-member?
- Free-travel cost in game-time (zero? cooldown? gold?)
- Party-bound NPC minion participation in player chat: passive observer or active chatter?

## Bind Tickets

- TASK-party-schema-crud-routes-and-migration
- TASK-party-travel-engine-adjacency-and-fast-travel
- TASK-party-free-jump-location-graph-edge
- TASK-party-schedule-and-patrol-routes
- TASK-party-world-tick-and-chat-transfer-integration
- TASK-party-chat-branch-merge-on-converge
- TASK-party-economy-shared-loot-and-currency-split
- TASK-party-bound-npc-retinue-and-group-behavior
- TASK-party-ui-roster-route-schedule-stats

