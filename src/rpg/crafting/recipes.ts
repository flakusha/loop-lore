/**
 * Recipes Service
 *
 * CRUD for crafting recipes and their material requirements.
 * Recipes define what can be crafted, what materials are needed,
 * and the base crafting parameters.
 */
import type { Kysely, } from "kysely";
import type { CraftingDiscipline, CraftingStationType, QualityLevel, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { uid, } from "../../utils";

// ── Types ───────────────────────────────────────────────────

export interface CreateRecipeOpts {
  worldId: string;
  name: string;
  description?: string;
  discipline: CraftingDiscipline;
  tier: number;
  levelRequired: number;
  outputItemId: string;
  outputQuantity?: number;
  craftingTimeSeconds?: number;
  baseSuccessChance?: number;
  baseQualityMin?: number;
  baseQualityMax?: number;
  perfectThreshold?: number;
  stationTypeRequired?: CraftingStationType;
  discoveredByDefault?: boolean;
  tags?: string[];
  materials: CreateRecipeMaterialOpts[];
}

export interface CreateRecipeMaterialOpts {
  itemId: string;
  quantity: number;
  slotType?: "required" | "optional" | "catalyst";
  qualityRequirement?: QualityLevel;
  bonusEffect?: string;
  sortOrder?: number;
}

export interface UpdateRecipeOpts {
  name?: string;
  description?: string;
  discipline?: CraftingDiscipline;
  tier?: number;
  levelRequired?: number;
  outputItemId?: string;
  outputQuantity?: number;
  craftingTimeSeconds?: number;
  baseSuccessChance?: number;
  baseQualityMin?: number;
  baseQualityMax?: number;
  perfectThreshold?: number;
  stationTypeRequired?: CraftingStationType | null;
  discoveredByDefault?: boolean;
  tags?: string[];
}

export interface RecipeWithMaterials {
  id: string;
  worldId: string;
  name: string;
  description: string | null;
  discipline: CraftingDiscipline;
  tier: number;
  levelRequired: number;
  outputItemId: string;
  outputQuantity: number;
  craftingTimeSeconds: number;
  baseSuccessChance: number;
  baseQualityMin: number;
  baseQualityMax: number;
  perfectThreshold: number;
  stationTypeRequired: CraftingStationType | null;
  discoveredByDefault: boolean;
  tags: string[];
  materials: RecipeMaterialRow[];
  createdAt: string;
  updatedAt: string;
}

export interface RecipeMaterialRow {
  id: string;
  recipeId: string;
  itemId: string;
  quantity: number;
  slotType: string;
  qualityRequirement: QualityLevel | null;
  bonusEffect: string | null;
  sortOrder: number;
}

// ── Service ─────────────────────────────────────────────────

export class RecipesService {
  constructor(private readonly db: Kysely<DB>,) {}

  /** Create a recipe with materials in a single transaction. */
  async createRecipe(opts: CreateRecipeOpts,): Promise<string> {
    const id = uid();
    const now = new Date().toISOString();

    await this.db.transaction().execute(async (trx,) => {
      await trx
        .insertInto("crafting_recipes",)
        .values({
          id,
          world_id: opts.worldId,
          name: opts.name,
          description: opts.description ?? null,
          discipline: opts.discipline,
          tier: opts.tier,
          level_required: opts.levelRequired,
          output_item_id: opts.outputItemId,
          output_quantity: opts.outputQuantity ?? 1,
          crafting_time_seconds: opts.craftingTimeSeconds ?? 0,
          base_success_chance: opts.baseSuccessChance ?? 1,
          base_quality_min: opts.baseQualityMin ?? 0,
          base_quality_max: opts.baseQualityMax ?? 100,
          perfect_threshold: opts.perfectThreshold ?? 95,
          station_type_required: opts.stationTypeRequired ?? null,
          discovered_by_default: opts.discoveredByDefault ? 1 : 0,
          tags: JSON.stringify(opts.tags ?? [],),
          created_at: now,
          updated_at: now,
        },)
        .execute();

      if (opts.materials.length > 0) {
        await trx
          .insertInto("crafting_recipe_materials",)
          .values(
            opts.materials.map((mat,) => ({
              id: uid(),
              recipe_id: id,
              item_id: mat.itemId,
              quantity: mat.quantity,
              slot_type: mat.slotType ?? "required",
              quality_requirement: mat.qualityRequirement ?? null,
              bonus_effect: mat.bonusEffect ?? null,
              sort_order: mat.sortOrder ?? 0,
              created_at: now,
            })),
          )
          .execute();
      }
    },);

    return id;
  }

  /** Get a recipe with all its materials. */
  async getRecipe(recipeId: string,): Promise<RecipeWithMaterials | null> {
    const recipe = await this.db
      .selectFrom("crafting_recipes",)
      .where("id", "=", recipeId,)
      .selectAll()
      .executeTakeFirst();

    if (!recipe) { return null; }

    const materials = await this.db
      .selectFrom("crafting_recipe_materials",)
      .where("recipe_id", "=", recipeId,)
      .orderBy("sort_order", "asc",)
      .selectAll()
      .execute();

    return {
      id: recipe.id,
      worldId: recipe.world_id,
      name: recipe.name,
      description: recipe.description,
      discipline: recipe.discipline,
      tier: recipe.tier,
      levelRequired: recipe.level_required,
      outputItemId: recipe.output_item_id,
      outputQuantity: recipe.output_quantity,
      craftingTimeSeconds: recipe.crafting_time_seconds,
      baseSuccessChance: recipe.base_success_chance,
      baseQualityMin: recipe.base_quality_min,
      baseQualityMax: recipe.base_quality_max,
      perfectThreshold: recipe.perfect_threshold,
      stationTypeRequired: recipe.station_type_required,
      discoveredByDefault: recipe.discovered_by_default === 1,
      tags: JSON.parse(recipe.tags,) as string[],
      materials: materials.map((m,) => ({
        id: m.id,
        recipeId: m.recipe_id,
        itemId: m.item_id,
        quantity: m.quantity,
        slotType: m.slot_type,
        qualityRequirement: m.quality_requirement,
        bonusEffect: m.bonus_effect,
        sortOrder: m.sort_order,
      })),
      createdAt: recipe.created_at,
      updatedAt: recipe.updated_at,
    };
  }

  /** List all recipes for a world, optionally filtered by discipline. */
  async listRecipes(
    worldId: string,
    opts?: { discipline?: CraftingDiscipline; tier?: number },
  ): Promise<RecipeWithMaterials[]> {
    let query = this.db
      .selectFrom("crafting_recipes",)
      .where("world_id", "=", worldId,)
      .orderBy("tier", "asc",)
      .orderBy("name", "asc",);

    if (opts?.discipline) {
      query = query.where("discipline", "=", opts.discipline,);
    }
    if (opts?.tier) {
      query = query.where("tier", "=", opts.tier,);
    }

    const recipes = await query.selectAll().execute();

    const result: RecipeWithMaterials[] = [];
    for (const recipe of recipes) {
      const materials = await this.db
        .selectFrom("crafting_recipe_materials",)
        .where("recipe_id", "=", recipe.id,)
        .orderBy("sort_order", "asc",)
        .selectAll()
        .execute();

      result.push({
        id: recipe.id,
        worldId: recipe.world_id,
        name: recipe.name,
        description: recipe.description,
        discipline: recipe.discipline,
        tier: recipe.tier,
        levelRequired: recipe.level_required,
        outputItemId: recipe.output_item_id,
        outputQuantity: recipe.output_quantity,
        craftingTimeSeconds: recipe.crafting_time_seconds,
        baseSuccessChance: recipe.base_success_chance,
        baseQualityMin: recipe.base_quality_min,
        baseQualityMax: recipe.base_quality_max,
        perfectThreshold: recipe.perfect_threshold,
        stationTypeRequired: recipe.station_type_required,
        discoveredByDefault: recipe.discovered_by_default === 1,
        tags: JSON.parse(recipe.tags,) as string[],
        materials: materials.map((m,) => ({
          id: m.id,
          recipeId: m.recipe_id,
          itemId: m.item_id,
          quantity: m.quantity,
          slotType: m.slot_type,
          qualityRequirement: m.quality_requirement,
          bonusEffect: m.bonus_effect,
          sortOrder: m.sort_order,
        })),
        createdAt: recipe.created_at,
        updatedAt: recipe.updated_at,
      },);
    }

    return result;
  }

  /** Update a recipe's base properties. */
  async updateRecipe(recipeId: string, opts: UpdateRecipeOpts,): Promise<boolean> {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updated_at: now, };

    if (opts.name !== undefined) { updates.name = opts.name; }
    if (opts.description !== undefined) { updates.description = opts.description; }
    if (opts.discipline !== undefined) { updates.discipline = opts.discipline; }
    if (opts.tier !== undefined) { updates.tier = opts.tier; }
    if (opts.levelRequired !== undefined) { updates.level_required = opts.levelRequired; }
    if (opts.outputItemId !== undefined) { updates.output_item_id = opts.outputItemId; }
    if (opts.outputQuantity !== undefined) { updates.output_quantity = opts.outputQuantity; }
    if (opts.craftingTimeSeconds !== undefined) { updates.crafting_time_seconds = opts.craftingTimeSeconds; }
    if (opts.baseSuccessChance !== undefined) { updates.base_success_chance = opts.baseSuccessChance; }
    if (opts.baseQualityMin !== undefined) { updates.base_quality_min = opts.baseQualityMin; }
    if (opts.baseQualityMax !== undefined) { updates.base_quality_max = opts.baseQualityMax; }
    if (opts.perfectThreshold !== undefined) { updates.perfect_threshold = opts.perfectThreshold; }
    if (opts.stationTypeRequired !== undefined) { updates.station_type_required = opts.stationTypeRequired; }
    if (opts.discoveredByDefault !== undefined) { updates.discovered_by_default = opts.discoveredByDefault ? 1 : 0; }
    if (opts.tags !== undefined) { updates.tags = JSON.stringify(opts.tags,); }

    const result = await this.db
      .updateTable("crafting_recipes",)
      .set(updates,)
      .where("id", "=", recipeId,)
      .executeTakeFirst();

    return (result.numUpdatedRows ?? 0n) > 0n;
  }

  /** Delete a recipe and its materials (cascade handles materials). */
  async deleteRecipe(recipeId: string,): Promise<boolean> {
    const result = await this.db
      .deleteFrom("crafting_recipes",)
      .where("id", "=", recipeId,)
      .executeTakeFirst();

    return (result.numDeletedRows ?? 0n) > 0n;
  }

  /** Replace all materials for a recipe. */
  async replaceMaterials(recipeId: string, materials: CreateRecipeMaterialOpts[],): Promise<void> {
    const now = new Date().toISOString();

    await this.db.transaction().execute(async (trx,) => {
      await trx
        .deleteFrom("crafting_recipe_materials",)
        .where("recipe_id", "=", recipeId,)
        .execute();

      if (materials.length > 0) {
        await trx
          .insertInto("crafting_recipe_materials",)
          .values(
            materials.map((mat,) => ({
              id: uid(),
              recipe_id: recipeId,
              item_id: mat.itemId,
              quantity: mat.quantity,
              slot_type: mat.slotType ?? "required",
              quality_requirement: mat.qualityRequirement ?? null,
              bonus_effect: mat.bonusEffect ?? null,
              sort_order: mat.sortOrder ?? 0,
              created_at: now,
            })),
          )
          .execute();
      }
    },);
  }
}
