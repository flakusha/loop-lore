# FEAT: Memory Systems (Three-Tier)

**Status:** 🟡 Partial — episodic/semantic/procedural typing + wiring built; cross-tier promotion + per-viewer isolation verification open
**Priority:** medium
**Effort:** Large
**Epic:** epic-memory-systems

## Summary

Three-tier memory system: episodic (recent events), semantic (facts/knowledge), procedural (skills/abilities). From `epic-memory-systems.md`.

## Scope

### Three Tiers

- **Episodic** — Recent events, conversation history
- **Semantic** — Facts, knowledge, world info
- **Procedural** — Skills, abilities, learned behaviors

### Memory Management

- Memory formation and consolidation
- Memory decay and forgetting
- Memory promotion between tiers

### Integration

- Context window injection
- Character personality
- World state

## Linked Epics

- `epic-memory-systems.md`

## Acceptance Criteria

- [x] Episodic memory system (recent events)
- [ ] Semantic memory system (facts/knowledge)
- [ ] Procedural memory system (skills/abilities)
- [ ] Memory formation and consolidation
- [ ] Memory decay and forgetting
- [ ] Memory promotion between tiers
- [x] Context window integration
- [x] Unit tests for memory calculations
- [ ] Integration tests for memory workflow

## Notes

- Reference `epic-memory-systems.md` for full system design
- Consider memory capacity limits
- Balance memory retention vs. forgetting
- 2026-08-01: `MemoryType` (episodic/semantic/procedural) and wiring exist in `src/memory/`
  (types/provision/extraction/budget/purge/injection + `shareability.ts`). Status reconciled
  with `backlog.md` (memory wiring + injection privacy done).
- Open gap: verify group-chat injection passes a per-viewer actor into
  `evaluateShareability`/`shouldInjectMemory` so knowledge isolation (e.g. dark-elves know,
  humans don't) holds per-message. See `IDEA-memory-knowledge-isolation-and-world-timeline.md`.
