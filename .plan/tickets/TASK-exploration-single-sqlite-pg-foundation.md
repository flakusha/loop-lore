# TASK: Exploration: Single SQLite/PG Foundation

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-world-locations

## Summary

Exploration system on single SQLite (bun:sqlite) foundation, with future PG migration path. From `epic-world-locations.md`.

## Scope

### SQLite Foundation

- World data in SQLite
- Location queries and traversal
- Performance optimization

### PG Migration Path

- Schema compatibility
- Migration scripts
- Performance comparison

### Exploration Mechanics

- Map traversal
- Discovery tracking
- Fog of war

## Linked Epics

- `epic-world-locations.md`

## Acceptance Criteria

- [ ] SQLite-based world storage
- [ ] Location queries and traversal
- [ ] Performance optimization for SQLite
- [ ] PG migration schema compatibility
- [ ] Migration scripts documented
- [ ] Performance comparison SQLite vs. PG
- [ ] Map traversal mechanics
- [ ] Discovery tracking system
- [ ] Unit tests for exploration logic
- [ ] Integration tests for exploration workflow

## Notes

- Reference `epic-world-locations.md` for full system design
- Start with SQLite, design for PG migration
- Consider query performance for large worlds
