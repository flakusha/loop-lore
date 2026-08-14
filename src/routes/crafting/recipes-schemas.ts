/**
 * Crafting Recipe route schemas.
 *
 * TypeBox validation + response schemas for the crafting recipe CRUD routes
 * (`recipes.ts`). Extracted to keep the route module under the 250L ceiling.
 */
import { t, } from "elysia";
import { CraftingDiscipline, CraftingStationType, QualityLevel, } from "../../db/enums";
import { Id, } from "../../validation/schemas";

export const recipeMaterialSchema = t.Object({
  itemId: Id,
  quantity: t.Integer({ minimum: 1, },),
  slotType: t.Optional(t.Union([t.Literal("required",), t.Literal("optional",), t.Literal("catalyst",),],),),
  qualityRequirement: t.Optional(t.Enum(QualityLevel,),),
  bonusEffect: t.Optional(t.String(),),
  sortOrder: t.Optional(t.Integer(),),
},);

export const recipeBody = t.Object({
  name: t.String({ minLength: 1, },),
  description: t.Optional(t.String(),),
  discipline: t.Enum(CraftingDiscipline,),
  tier: t.Integer({ minimum: 1, },),
  levelRequired: t.Integer({ minimum: 0, },),
  outputItemId: Id,
  outputQuantity: t.Optional(t.Integer({ minimum: 1, },),),
  craftingTimeSeconds: t.Optional(t.Integer({ minimum: 0, },),),
  baseSuccessChance: t.Optional(t.Number({ minimum: 0, maximum: 1, },),),
  baseQualityMin: t.Optional(t.Integer({ minimum: 0, },),),
  baseQualityMax: t.Optional(t.Integer({ minimum: 0, },),),
  perfectThreshold: t.Optional(t.Integer({ minimum: 0, },),),
  stationTypeRequired: t.Optional(t.Enum(CraftingStationType,),),
  discoveredByDefault: t.Optional(t.Boolean(),),
  tags: t.Optional(t.Array(t.String(),),),
  materials: t.Optional(t.Array(recipeMaterialSchema,),),
},);

export const updateRecipeBody = t.Partial(
  t.Omit(recipeBody, ["name", "materials",],),
);

export const recipeResponse = t.Object({
  id: Id,
  worldId: Id,
  name: t.String(),
  description: t.Union([t.String(), t.Null(),],),
  discipline: t.Enum(CraftingDiscipline,),
  tier: t.Integer(),
  levelRequired: t.Integer(),
  outputItemId: Id,
  outputQuantity: t.Integer(),
  craftingTimeSeconds: t.Integer(),
  baseSuccessChance: t.Number(),
  baseQualityMin: t.Integer(),
  baseQualityMax: t.Integer(),
  perfectThreshold: t.Integer(),
  stationTypeRequired: t.Union([t.Enum(CraftingStationType,), t.Null(),],),
  discoveredByDefault: t.Boolean(),
  tags: t.Array(t.String(),),
  createdAt: t.String(),
  updatedAt: t.String(),
},);

export const listResponse = t.Object({ recipes: t.Array(recipeResponse,), },);
