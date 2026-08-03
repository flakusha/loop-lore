# IDEA: Memory Knowledge Isolation and World Timeline

**Status:** Open
**Priority:** Low
**Effort:** Large
**Epic:** epic-memory-knowledge-systems
**Labels:** memory, privacy, isolation, timeline
**Related:** `FEAT-memory-systems-three-tier.md`, `docs/spec/memory-system.md`, `src/memory/`

## Summary

Implement memory privacy controls to isolate knowledge between characters/sessions. Prevent cross-contamination of lore and events. Ensure world timeline consistency across sessions and characters.

## Background

Current memory system (`src/memory/`) provisions context based on budget and trust modifiers but lacks explicit isolation boundaries. Characters in the same world can "leak" knowledge through shared memory pools. Multi-session support (`epic-multi-session`) exacerbates this — session A's discoveries shouldn't automatically appear in session B's context unless explicitly shared.

## Scope

### 1. Isolation Boundaries

Define explicit memory isolation domains:

- **Character-private**: Memories only visible to that character's sessions
- **Party-shared**: Memories shared within a party/group
- **World-public**: Lore/events visible to all in the world
- **GM-only**: Shadow notes, whitenotes, hidden lore

### 2. Cross-Session Leakage Prevention

- Session-specific memory budgets (`src/memory/budget.ts`)
- Explicit sharing flags on memory entries
- Audit trail for cross-session knowledge transfer

### 3. World Timeline Consistency

- Event ordering across sessions
- Conflict detection for contradictory events
- Timeline merge strategies for multi-session worlds

## Acceptance Criteria

- [ ] Per-character memory isolation boundaries defined and enforced
- [ ] Cross-session knowledge leakage prevented by default
- [ ] World timeline consistency checks implemented
- [ ] Documentation of isolation rules in `docs/spec/memory-system.md`
- [ ] Unit tests for isolation boundaries and timeline merging

## Files

- `src/memory/isolation.ts` — isolation boundary logic
- `src/memory/timeline.ts` — world timeline consistency
- `src/db/schema-memory.ts` — isolation flags on memory entries
- `docs/spec/memory-system.md` — isolation documentation
