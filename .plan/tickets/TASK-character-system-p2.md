# TASK: Character System — P2 Core Gameplay

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Epic:** epic-character-core-system

## Summary

P2 character system covering multi-personality switching, mood/happiness meter, and memory injection probability. Complements existing P1 work (Memory Tiers Wiring, NSFW integration).

## Scope

### Multi-Personality Switching

- Random, stimulus-based, locked, and manual switching modes
- Personality activation conditions with weighted triggers
- Personality lock per world/chat context

### Mood & Happiness Meter

- 0–100 happiness scale with 10 mood labels
- Mood triggers from events, time decay, relationships, world state
- Expression modifiers (tone, verbosity, cooperation, warmth, humor)
- Mood does NOT change personality — only expression

### Memory Injection Probability & Privacy

- Configurable injection probability per character
- Five privacy levels: absolute, isolated, localized, contextual, public
- Comfort system: sharing probability based on relationship and mood

## Sub-Tickets

| Ticket                                | Scope                        | Status         |
| ------------------------------------- | ---------------------------- | -------------- |
| `TASK-character-multi-personality.md` | Personality switching        | ⬜ Not Started |
| `TASK-character-mood-happiness.md`    | Mood/happiness meter         | 🟡 In Progress |
| `TASK-character-memory-injection.md`  | Memory injection probability | ✅ Done        |

## Acceptance Criteria

- [ ] `TASK-character-multi-personality.md` — personality switching with stimulus/locked/manual modes
- [ ] `TASK-character-mood-happiness.md` — mood system integrated into character resolver
- [ ] `TASK-character-memory-injection.md` — privacy levels and comfort system functional
- [ ] Cross-system integration: mood affects dialogue generation, personality affects memory sharing
- [ ] All sub-tickets have passing unit tests

## Notes

- Character mood modifies expression, NOT personality (enforced by personality integrity system)
- Memory injection probability affects narrative quality — tune carefully
- See `epic-character-core-system.md` for full design; RPG mechanics are tracked under `epic-rpg-mechanics.md`
