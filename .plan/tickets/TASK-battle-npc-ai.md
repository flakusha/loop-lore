# TASK: Battle NPC AI Integration

**Epic:** Battle & Action Systems, NPC Navigation
**Priority:** Medium
**Effort:** High
**Status:** Not Started
**Created:** 2026-07-28
**Cross-Mechanics Gap:** G3 (Battle ↔ NPC/Actor)

## Summary

NPC combatants driven by personality-driven AI instead of generic enemy scripts. Personality affects combat tactics, morale, and decision-making.

## Background

Battle has NPC enemies but never references the Actor system for personality-driven AI, morale, memory of past defeats. NPC behavior is static — they attack and nothing else.

## Implementation

### Personality-Driven Combat AI

| Personality Trait | Combat Behavior                         |
| ----------------- | --------------------------------------- |
| Aggressive        | Attacks strongest target, no retreat    |
| Defensive         | Keeps distance, uses cover              |
| Tactical          | Targets weakest, uses feints            |
| Cowardly          | Flee at low HP, panic at allies falling |
| Brave             | Fight to death, no retreat              |
| Sadistic          | Lingers on defeated foes                |
| Merciful          | Offers surrender at low HP              |

### Memory System

NPCs remember past encounters with the party. Repeated victories by PCs make NPCs more cautious. Repeated defeats make them more aggressive.

## Acceptance Criteria

- [ ] NPC combat behavior varies by personality trait
- [ ] NPC morale affected by HP, allies down, enemy strength
- [ ] NPC memory of past encounters with party
- [ ] NPCs can flee, surrender, or parley
