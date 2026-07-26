# TASK: World Event & Timeline System

**Priority:** Medium
**Status:** ⬜ Not Started
**Epic:** epic-world-locations
**Tags:** world, events, timeline, dynamic, narrative

## Description

Add a dynamic world event system to the World & Locations epic — timed events, world-altering player actions, and a persistent timeline that tracks how the world changes over time. Makes worlds feel alive and responsive to player actions.

## How It Extends Existing Work

Builds on the World & Locations epic's world conditions, environmental state, and world-scoped characters. Adds event-driven dynamics and a persistent timeline on top of the existing world infrastructure.

## Acceptance Criteria

- [ ] World event types (narrative, environmental, political, monster invasion)
- [ ] Event scheduling (one-time, recurring, conditional triggers)
- [ ] Player-action-triggered world events (e.g., "defeating boss X opens region Y")
- [ ] World timeline — persistent record of all major events
- [ ] Event consequences that persist across sessions (ties to World Persistence)
- [ ] Event notification system for affected players
- [ ] `GET /api/worlds/:id/events` — list active/scheduled events
- [ ] `POST /api/worlds/:id/events` — trigger a world event (GM/admin)
- [ ] Frontend event timeline panel
- [ ] Frontend event notification toast

## Technical Notes

- World events stored with trigger conditions, participants, and consequence definitions
- Timeline uses the existing Kysely DB with world-scoped event records
- Event consequences can modify world state, NPC behavior, and location availability
- Integrates with World Persistence & Sync epic for cross-session consistency
