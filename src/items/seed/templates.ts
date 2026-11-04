// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/items/seed/templates.ts — Item template seeding logic

import type { Kysely, } from "kysely";
import type { ItemsConfig, } from "../../config/schema";
import type { ItemTemplate, } from "../../config/sections/items/types";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { createDefinition, } from "../../story/items/definitions";
import { DuplicateItemDefinitionError, type ItemDefinition, type ItemState, } from "../../story/items/types";

interface SeedResult {
  created: number;
  skipped: number;
  errors: string[];
}

/**
 * Expand a config template into a full item definition for one world.
 * @param template - Config item template
 * @param worldId - Target world
 * @returns Definition ready for {@link createDefinition}
 */
function toDefinition(template: ItemTemplate, worldId: string,): ItemDefinition {
  return {
    worldId,
    name: template.name,
    description: template.description ?? "",
    category: template.category,
    rarity: template.rarity ?? "common",
    stackable: template.stackable ?? false,
    maxStack: template.maxStack ?? 1,
    properties: template.properties ?? {},
    value: template.value ?? 0,
    weight: template.weight ?? 0,
  };
}

/**
 * Seed default item definitions from config templates.
 * Runs on app start — idempotent (skips existing by world+name+category).
 * Supports hard IDs for deterministic test reseeding.
 * @param database - Kysely DB instance
 * @param config - Items config section
 * @param worldId - Restrict seeding to one world; omit to seed into every world
 * @returns Seed result with counts
 */
export async function seedItemTemplates(
  database: Kysely<DB>,
  config: ItemsConfig,
  worldId?: string,
): Promise<SeedResult> {
  const result: SeedResult = { created: 0, skipped: 0, errors: [], };
  if (!config.enabled || config.templates.length === 0) { return result; }

  const logger = getLogger();
  const worlds = worldId
    ? [{ id: worldId, name: worldId, },]
    : await database.selectFrom("worlds",).select(["id", "name",],).execute();

  const state: ItemState = { db: database, };

  for (const world of worlds) {
    for (const template of config.templates) {
      // Global seeding honors per-world templates; an explicit worldId arg overrides
      if (
        worldId === undefined && template.world && template.world !== world.id &&
        template.world.toLowerCase() !== world.name.toLowerCase()
      ) {
        continue;
      }

      try {
        await createDefinition(state, toDefinition(template, world.id,), template.id,);
        result.created++;
      } catch (error) {
        if (error instanceof DuplicateItemDefinitionError) {
          result.skipped++;
          continue;
        }

        const message = error instanceof Error ? error.message : String(error,);
        logger.warn(`item template "${template.name}" failed to seed: ${message}`,);
        result.errors.push(`${template.name}: ${message}`,);
      }
    }
  }

  return result;
}
