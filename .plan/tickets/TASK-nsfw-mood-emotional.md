# TASK: NSFW Mood & Emotional State

**Epic:** AO NSFW Game Mechanics
**Priority:** High
**Effort:** Medium
**Status:** Not Started

## Summary

Implement NSFW-specific emotional state tracking: arousal, happiness, comfort, trust, excitement, nervousness, shame, guilt. Mood affects all NSFW interactions and can be modified by events, trauma, and partner behavior.

## Core Features

### Emotional Dimensions

- Arousal (0-100)
- Happiness (0-100)
- Comfort (0-100)
- Trust (0-100)
- Excitement (0-100)
- Nervousness (0-100)
- Shame (0-100)
- Guilt (0-100)

### Mood Effects

- Nervousness/shame → increases seduction resistance
- Excitement → increases arousal buildup
- Happiness/comfort → improves performance
- Strong emotions → stronger memories

### Mood Modifiers

- Partner behavior
- Location atmosphere
- Items/drugs
- Past experiences
- Trauma triggers

### Emotional History

- Track significant emotional events
- Emotional patterns over time
- Trauma from negative experiences

## Tasks

- [ ] Design mood system architecture
- [ ] Implement emotional dimensions
- [ ] Implement mood effects on gameplay
- [ ] Implement mood modifiers
- [ ] Implement emotional history
- [ ] Implement mood persistence
- [ ] Integrate with seduction system
- [ ] Integrate with encounter system
- [ ] Integrate with intimacy system
- [ ] Write tests for mood system

## Files

- `src/rpg/mood-nsfw/manager.ts` — mood manager
- `src/rpg/mood-nsfw/dimensions.ts` — emotional dimensions
- `src/rpg/mood-nsfw/effects.ts` — mood effects
- `src/rpg/mood-nsfw/modifiers.ts` — mood modifiers
- `src/rpg/mood-nsfw/history.ts` — emotional history
- `src/rpg/mood-nsfw/types.ts` — type definitions
