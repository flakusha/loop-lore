# TASK: NSFW Location & Environment

**Epic:** AO NSFW Game Mechanics
**Priority:** Medium
**Effort:** Medium
**Status:** Not Started

## Summary

Implement NSFW-specific location mechanics: privacy levels, atmosphere modifiers, available equipment, location-specific actions, discovery risk, and location effects on encounters.

## Core Features

### Location Types

- Bedroom, Bathroom, Kitchen, Dungeon, Brothel, Tavern, Alley, Forest, Beach, Hot Spring, Carriage, Throne Room, Temple, Library, Garden, Balcony, Stage, Club, etc.

### Privacy Levels

- Public: high discovery risk, arousal modifier
- Semi-private: moderate risk
- Private: low risk
- Isolated: no risk

### Atmosphere

- Romantic, Dangerous, Comfortable, Exotic, Seedy
- Affects arousal buildup, mood, encounter type availability

### Equipment

- Location-specific equipment (bed, bondage furniture, etc.)
- Enables specific techniques/actions
- Can be brought to locations

### Discovery Risk

- Chance of being caught
- Consequences if caught (reputation, social, legal)
- Risk modifiers (time of day, noise, visibility)

## Tasks

- [ ] Design NSFW location architecture
- [ ] Implement privacy levels
- [ ] Implement atmosphere modifiers
- [ ] Implement location equipment
- [ ] Implement discovery risk
- [ ] Implement location-specific actions
- [ ] Implement discovery consequences
- [ ] Integrate with encounter system
- [ ] Integrate with reputation system
- [ ] Integrate with world/locations epic
- [ ] Write tests for NSFW locations

## Files

- `src/rpg/locations-nsfw/manager.ts` — location manager
- `src/rpg/locations-nsfw/privacy.ts` — privacy levels
- `src/rpg/locations-nsfw/atmosphere.ts` — atmosphere
- `src/rpg/locations-nsfw/equipment.ts` — equipment
- `src/rpg/locations-nsfw/discovery.ts` — discovery risk
- `src/rpg/locations-nsfw/types.ts` — type definitions
