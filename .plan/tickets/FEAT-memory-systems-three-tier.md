# FEAT: Memory Systems (Three-Tier)

**Status:** 🟡 In Progress
**Priority:** medium
**Effort:** Large
**Epic:** epic-memory-systems

## Summary

Three-tier memory system: episodic (recent events), semantic (facts/knowledge), procedural (skills/habits). Only actor_memories table exists. From docs/spec/memory-system.md.

## Acceptance Criteria

- [x] Implementation complete (episodic, semantic, procedural types exist)
- [x] Tests passing
- [ ] Documentation updated

## Files

- `src/memory/types.ts` — memory types with three-tier support (✅ exists)
- `src/memory/extraction.ts` — memory extraction with three-tier types (✅ exists)
- `src/memory/purge.ts` — memory decay and purge (✅ exists)
- `src/memory/injection.ts` — memory injection (✅ exists)
- `src/memory/provision.ts` — memory provision (✅ exists)
- `src/memory/budget.ts` — memory budget (✅ exists)
- `src/memory/shareability.ts` — memory shareability (✅ exists)
