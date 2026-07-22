# TASK: Crafting System Implementation

**Epic:** RPG Mechanics & Extensible Game Systems
**Priority:** Medium
**Effort:** Medium
**Status:** Not Started

## Summary

Implement crafting system with recipes, logic limitations, and pre-compiled items/lists.

## Crafting Recipes

### Recipe Structure

- Input items (ingredients)
- Output item (result)
- Crafting time
- Required skills/tools
- Success/failure chance

### Recipe Types

- Standard crafting (combine items)
- Refining (improve item quality)
- Enchanting (add magical properties)
- Alchemy (create potions/consumables)
- Smithing (create weapons/armor)

## Logic Limitations

### Crafting Constraints

- Skill level requirements
- Tool requirements
- Location requirements (forge, workbench, etc.)
- Material quality requirements
- Recipe discovery requirements

### Failure Conditions

- Insufficient materials
- Insufficient skill level
- Missing required tools
- Wrong location
- Random failure chance

## Pre-compiled Items

### Item Templates

- Pre-defined item templates
- Parameterized item generation
- Item quality tiers
- Item rarity system

### Lists with Setup

- Crafting material lists
- Recipe ingredient lists
- Tool requirement lists
- Skill requirement lists

## Design

### Recipe Structure

```typescript
interface CraftingRecipe {
  id: string;
  name: string;
  description: string;
  type: "standard" | "refining" | "enchanting" | "alchemy" | "smithing";
  inputs: CraftingInput[];
  outputs: CraftingOutput[];
  craftingTime: number; // seconds
  skillRequirements: SkillRequirement[];
  toolRequirements: ToolRequirement[];
  locationRequirements: LocationRequirement[];
  successChance: number; // 0-1
  discovered: boolean;
}

interface CraftingInput {
  itemId: string;
  quantity: number;
  quality?: "common" | "uncommon" | "rare" | "epic" | "legendary";
}

interface CraftingOutput {
  itemId: string;
  quantity: number;
  quality: "common" | "uncommon" | "rare" | "epic" | "legendary";
  chance: number; // 0-1
}
```

### Pre-compiled Items

```typescript
interface ItemTemplate {
  id: string;
  name: string;
  type: "weapon" | "armor" | "consumable" | "material" | "tool";
  baseStats: Record<string, number>;
  qualityTiers: QualityTier[];
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
}

interface QualityTier {
  name: string;
  statMultiplier: number;
  dropChance: number;
}
```

## Tasks

- [ ] Design crafting data model
- [ ] Implement recipe system
- [ ] Implement crafting constraints
- [ ] Implement failure conditions
- [ ] Implement item templates
- [ ] Implement quality tiers
- [ ] Implement recipe discovery
- [ ] Implement crafting UI
- [ ] Implement recipe book UI
- [ ] Write tests for crafting system

## Files

- `src/rpg/crafting.ts` — crafting system
- `src/rpg/recipes.ts` — recipe management
- `src/rpg/item-templates.ts` — item templates
- `src/db/schema-crafting.ts` — crafting tables
- `src/routes/crafting.ts` — crafting API
- `src/frontend/rpg/crafting/` — crafting UI
