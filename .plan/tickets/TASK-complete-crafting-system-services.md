# TASK: Complete crafting system services

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-crafting-professions

## Summary

RecipesService implemented. Missing: ProfessionsService, StationsService, QualityService, CraftingProcessService, GatheringService, DiscoveryService. See `src/rpg/crafting/index.ts` TODOs.

## Scope

### Services to Implement

| Service                    | Responsibility                             | Key Methods                                            |
| -------------------------- | ------------------------------------------ | ------------------------------------------------------ |
| **ProfessionsService**     | Track player profession levels, XP, titles | `getLevel()`, `addXP()`, `getBonuses()`                |
| **StationsService**        | Manage crafting stations, tier bonuses     | `getStation()`, `applyBonuses()`, `getTierBonus()`     |
| **QualityService**         | Calculate item quality tier                | `calculateQuality()`, `getQualityBonuses()`            |
| **CraftingProcessService** | Orchestrate crafting attempt               | `craft()`, `calculateSuccess()`, `getCriticalChance()` |
| **GatheringService**       | Handle resource gathering                  | `gather()`, `getYield()`, `applyToolBonus()`           |
| **DiscoveryService**       | Unlock new recipes                         | `discover()`, `checkPrerequisites()`, `unlockRecipe()` |

## Linked Epics

- `epic-crafting-professions.md`

## Acceptance Criteria

- [ ] ProfessionsService: tracks player profession levels, XP, titles, and stat bonuses
- [ ] StationsService: manages crafting stations with tier bonuses (speed, quality, success, material saving)
- [ ] QualityService: calculates 6-tier quality system (Poor → Legendary) with stat bonuses
- [ ] CraftingProcessService: orchestrates crafting attempts with success/failure/critical outcomes
- [ ] GatheringService: handles resource gathering with tool bonuses and yield calculations
- [ ] DiscoveryService: unlocks new recipes based on prerequisites and skill level
- [ ] All services have unit tests
- [ ] Integration tests for full crafting workflow (gather → craft → quality check)
- [ ] Services are thin — business logic in domain, not in service methods

## Notes

- See `src/rpg/crafting/index.ts` for TODOs and existing RecipesService
- Follow existing service patterns in `src/rpg/`
- Services should use Kysely types, not DB-specific modules
