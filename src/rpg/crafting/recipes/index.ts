// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Recipes Service
 *
 * CRUD for crafting recipes and their material requirements.
 * Recipes define what can be crafted, what materials are needed,
 * and the base crafting parameters.
 *
 * The concrete CRUD / update / materials logic lives in isolated dispatcher
 * modules (crud, update, materials, helpers) threaded with an explicit `db`
 * handle. `RecipesService` remains a class so its methods stay on the
 * prototype.
 */
import type { Kysely, } from "kysely";
import type { CraftingDiscipline, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import {
  createRecipe as createRecipeDispatch,
  deleteRecipe as deleteRecipeDispatch,
  getRecipe as getRecipeDispatch,
  listRecipes as listRecipesDispatch,
} from "./crud";
import { replaceMaterials as replaceMaterialsDispatch, } from "./materials";
import type {
  CreateRecipeMaterialOpts,
  CreateRecipeOpts,
  RecipeWithMaterials,
  UpdateRecipeOpts,
} from "./types";
import { updateRecipe as updateRecipeDispatch, } from "./update";

export type {
  CreateRecipeMaterialOpts,
  CreateRecipeOpts,
  RecipeMaterialRow,
  RecipeWithMaterials,
  UpdateRecipeOpts,
} from "./types";

/**
 * Recipes Service
 *
 * CRUD for crafting recipes and their material requirements.
 */
export class RecipesService {
  /**
   * @param db
   */
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Create a recipe with materials in a single transaction.
   * @param opts
   */
  /**
   * @param {CreateRecipeOpts} opts
   * @returns {Promise<string>}
   */
  async createRecipe(opts: CreateRecipeOpts,): Promise<string> {
    return createRecipeDispatch(this.db, opts,);
  }

  /**
   * Get a recipe with all its materials.
   * @param recipeId
   */
  /**
   * @param {string} recipeId
   * @returns {Promise<RecipeWithMaterials | null>}
   */
  async getRecipe(recipeId: string,): Promise<RecipeWithMaterials | null> {
    return getRecipeDispatch(this.db, recipeId,);
  }

  /**
   * List all recipes for a world, optionally filtered by discipline.
   * @param worldId
   * @param opts
   * @param opts.discipline
   * @param opts.tier
   */
  /**
   * @param {string} worldId
   * @param {{ discipline?: CraftingDiscipline; tier?: number }} opts
   * @returns {Promise<RecipeWithMaterials[]>}
   */
  async listRecipes(
    worldId: string,
    opts?: { discipline?: CraftingDiscipline; tier?: number },
  ): Promise<RecipeWithMaterials[]> {
    return listRecipesDispatch(this.db, worldId, opts,);
  }

  /**
   * Update a recipe's base properties.
   * @param recipeId
   * @param opts
   */
  /**
   * @param {string} recipeId
   * @param {UpdateRecipeOpts} opts
   * @returns {Promise<boolean>}
   */
  async updateRecipe(recipeId: string, opts: UpdateRecipeOpts,): Promise<boolean> {
    return updateRecipeDispatch(this.db, recipeId, opts,);
  }

  /**
   * Delete a recipe and its materials (cascade handles materials).
   * @param recipeId
   */
  /**
   * @param {string} recipeId
   * @returns {Promise<boolean>}
   */
  async deleteRecipe(recipeId: string,): Promise<boolean> {
    return deleteRecipeDispatch(this.db, recipeId,);
  }

  /**
   * Replace all materials for a recipe.
   * @param recipeId
   * @param materials
   */
  /**
   * @param {string} recipeId
   * @param {CreateRecipeMaterialOpts[]} materials
   * @returns {Promise<void>}
   */
  async replaceMaterials(recipeId: string, materials: CreateRecipeMaterialOpts[],): Promise<void> {
    return replaceMaterialsDispatch(this.db, recipeId, materials,);
  }
}
