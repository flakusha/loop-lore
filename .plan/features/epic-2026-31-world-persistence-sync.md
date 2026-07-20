# Epic 2026-31: World Persistence & Sync

**Status:** Not Started (P2)
**Priority:** Medium
**Source:** docs/spec/architecture.md, docs/spec/users-sessions.md

## Summary

Cross-device synchronization, persistent worlds, world simulation while offline, and persona system for cross-context identity.

## Linked Tasks

| Task | Title | Priority | Status |
| ---- | ----- | -------- | ------ |
| FEAT-2026-002 | Impersonation (chat.impersonate_id) | Medium | Not Started |
| FEAT-2026-005 | Agentic workspace mode | Medium | Not Started |
| FEAT-2026-019 | Cross-Device E2E Sync Implementation | Medium | Not Started |
| FEAT-2026-028 | World Continues Without You Implementation | Medium | Not Started |
| FEAT-2026-029 | Personas | Medium | Not Started |
| FEAT-2026-033 | Shared Persistent Worlds Implementation | Medium | Not Started |

## Features

### Cross-Device Sync
- E2E encrypted sync across devices
- Device registration and key management
- Vector clock conflict resolution

### World Simulation
- Scheduled events while users offline
- NPC activity simulation
- Time-based quest progression

### Personas
- Cross-world identity
- Persona → Character conversion
- Character → Persona conversion

### Shared Worlds
- Multi-user world state
- Concurrent editing
- Access control for world changes

## Implementation Phases

### Phase 1: Device Sync
- [ ] Device registration endpoint
- [ ] Sync protocol (encrypted messages)
- [ ] Vector clock implementation

### Phase 2: World Simulation
- [ ] Scheduled event system
- [ ] NPC behavior engine
- [ ] Time-based triggers

### Phase 3: Personas
- [ ] Persona CRUD API
- [ ] Conversion pipelines
- [ ] Persona selection UI

### Phase 4: Shared Worlds
- [ ] World state locking
- [ ] Concurrent edit detection
- [ ] Merge conflict resolution

## Files
- `src/sync/protocol.ts` — Sync protocol
- `src/sync/device-registration.ts` — Device registration
- `src/world/simulation.ts` — World simulation
- `src/personas/controller.ts` — Persona API
- `src/personas/conversion.ts` — Conversion logic
- `src/db/schema-sync.ts` — Sync tables