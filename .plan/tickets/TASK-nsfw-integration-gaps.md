<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: NSFW Integration Gaps — Housing, Weather, Social, Disease

**Status:** ✅ Complete
**Priority:** High
**Effort:** Medium
**Epic:** epic-nsfw-game-mechanics

## Summary

The NSFW epic (`epic-nsfw-game-mechanics.md`, 848 lines) defines 8 gameplay systems but has zero cross-references to Housing, Weather, Social, or Disease systems. This ticket tracks the integration work to close these gaps.

## Linked Epics

- `epic-nsfw-game-mechanics.md`
- `epic-frontend-housing.md` (private spaces)
- `epic-weather-environment.md` (environmental mood)
- `epic-social-interaction.md` (reputation, persuasion)
- `epic-disease-poison.md` (reproductive health, STDs)
- `epic-character-core-system.md` (traits, mood, relationships)

## Acceptance Criteria

### G6: NSFW ↔ Housing Integration

- [ ] Private space types (bedroom, bath) mapped to Housing location traits
- [ ] Comfort/safety modifiers from Housing applied to NSFW encounter difficulty
- [ ] Housing equipment (beds, furniture) provides encounter bonuses
- [ ] Privacy level from Housing affects discovery risk in NSFW encounters

### G7: NSFW ↔ Weather Integration

- [ ] Weather mood modifiers feed into NSFW mood system
- [ ] Weather affects pheromone dispersion (range, effectiveness)
- [ ] Weather affects location availability for NSFW encounters (public spaces)
- [ ] Seasonal effects on fertility cycles and heat periods

### G8: NSFW ↔ Social Integration

- [ ] Shared `ReputationScore` schema (Social + Faction + NSFW)
- [ ] Social skills (persuasion, deception, intimidation) as seduction prerequisites
- [ ] NSFW encounter reputation changes feed into Social reputation model
- [ ] Social relationship tiers map to NSFW intimacy levels

### G9: NSFW ↔ Disease Integration

- [ ] Disease system covers reproductive health (STD status, fertility)
- [ ] NSFW encounters can transmit diseases (risk calculation)
- [ ] Pregnancy system references Disease for complications
- [ ] Contraception methods integrate with Disease prevention mechanics

## Integration Points

### Systems This Epic Depends On

| System  | What It Provides                           | How Used                                        |
| ------- | ------------------------------------------ | ----------------------------------------------- |
| Housing | Private space types, comfort/safety levels | NSFW encounter location modifiers               |
| Weather | Environmental mood, pheromone dispersion   | NSFW mood and encounter availability            |
| Social  | Reputation model, persuasion skills        | NSFW seduction prerequisites and reputation     |
| Disease | Reproductive health, STD status            | NSFW encounter risk and pregnancy complications |

### Systems That Depend On This Epic

| System         | What It Consumes                     | How Used                         |
| -------------- | ------------------------------------ | -------------------------------- |
| Character Core | NSFW content rating, intimacy levels | Character NSFW trait integration |
| Chat Lifecycle | NSFW toggle state                    | Moderation gating                |

### Shared Data Contracts

| Contract             | Shared With           | Purpose                           |
| -------------------- | --------------------- | --------------------------------- |
| `ReputationScore`    | Social, Faction, NSFW | Unified reputation across systems |
| `NSFWLocationType`   | Housing               | Private space classification      |
| `ReproductiveHealth` | Disease               | STD status, fertility tracking    |
| `EnvironmentalMood`  | Weather               | Mood modifiers for encounters     |

### Cross-System Events

| Event                      | Direction  | Purpose                                    |
| -------------------------- | ---------- | ------------------------------------------ |
| `nsfw.encounter.started`   | emits      | Trigger weather/housing modifier injection |
| `nsfw.encounter.completed` | emits      | Update reputation, disease status, mood    |
| `weather.changed`          | subscribes | Recalculate pheromone effectiveness        |
| `disease.transmitted`      | subscribes | Apply NSFW encounter risk                  |
