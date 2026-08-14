# TASK: Living-World Between-Session Persistence

**Epic:** epic-world-locations, epic-character-core-system
**Priority:** Medium (P6+ deferred)
**Effort:** High
**Status:** Not Started
**Created:** 2026-08-14
**Platform Candidate:** E3 (Living-world persistence — AI Town, Nomi, AI Dungeon)
**Research Source:** AI Town/Conductor (a16z), Nomi shared worlds, AI Dungeon continuity

## Summary

Enable "the world continues without you" — NPCs advance their schedules, relationships evolve, events occur, and the world state changes between player sessions. Players return to a world that has moved on.

## Background

Research on AI Town (a16z), Nomi shared worlds, and AI Dungeon continuity shows that living worlds where time passes between sessions create significantly deeper immersion. NPCs should continue their daily plans, relationships should drift, and world events should occur even when the player isn't present.

Extends `epic-world-locations.md` with between-session simulation.

## Implementation

### World-Time Simulation

```typescript
interface WorldTimeSimulation {
  world_id: string;
  last_simulation: Date;
  simulation_speed: number;     // real-time minutes per game-day
  elapsed_game_days: number;
  pending_events: WorldEvent[];
  npc_schedules: Map<string, DailyPlan>;
}

interface WorldEvent {
  id: string;
  type: "natural" | "social" | "economic" | "political" | "random";
  description: string;
  location: string;
  affected_npcs: string[];
  timestamp: Date;
  processed: boolean;
}
```

### Between-Session Processing

On session start:
1. Calculate elapsed real time since last session
2. Convert to game-time (configurable speed)
3. Advance NPC schedules for elapsed days
4. Process pending world events
5. Update relationship drift
6. Generate "catch-up" summary for player

### Catch-Up Summary

```typescript
interface WorldCatchUp {
  elapsed_game_days: number;
  npc_updates: Array<{
    npc_id: string;
    summary: string;           // "Kira completed her research project"
    relationship_change: number;
  }>;
  world_events: string[];      // "A merchant caravan arrived from the north"
  location_changes: string[];  // "The tavern has been renovated"
}
```

## Integration Points

- **epic-world-locations.md** — World state persistence
- **epic-agency-story-points.md** — NPC daily plans advance between sessions
- **TASK-npc-bdi-planning.md** — BDI loop runs between sessions
- **TASK-npc-to-npc-social.md** — NPC social interactions occur between sessions
- **TASK-character-relationships.md** — Relationship drift over elapsed time
- **epic-social-interaction.md** — Social events between sessions
- **Timeline system** — World-time tracks simulation elapsed time

## Acceptance Criteria

- [ ] World-time simulation advances between sessions
- [ ] NPCs complete daily plans between sessions
- [ ] World events occur between sessions
- [ ] Relationships drift over elapsed time
- [ ] Player receives catch-up summary on session start
- [ ] Simulation speed is configurable
- [ ] Performance: between-session processing completes in <5 seconds
- [ ] No data loss from between-session simulation

## Open Questions

1. What's the right simulation speed? (1 real-minute = 1 game-hour? 1 game-day?)
2. Should simulation be deterministic or include random events?
3. How detailed should the catch-up summary be?
4. Should players be able to set simulation preferences per world?
5. How to handle conflicts between player actions and simulated events?
