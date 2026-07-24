// src/characters/seed.ts — Character template seeder
//
// Seeds default characters from config on app start.
// Idempotent: checks by display_name + owner_id before insert.
// Never overrides existing DB records.

import type { Kysely, } from "kysely";
import type { CharactersConfig, } from "../config/schema";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { safeJsonStringify, uid, } from "../utils";

interface SeedResult {
  created: number;
  skipped: number;
  errors: string[];
}

/**
 * Seed default characters from config templates.
 * Runs on app start — idempotent (skips existing by name+owner).
 *
 * @param database - Kysely DB instance
 * @param config - Characters config section
 * @param ownerId - Owner ID for seeded characters (system user or null)
 * @returns Seed result with counts
 */
export async function seedCharacterTemplates(
  database: Kysely<DB>,
  config: CharactersConfig,
  ownerId: string | null = null,
): Promise<SeedResult> {
  const logger = getLogger();
  const result: SeedResult = { created: 0, skipped: 0, errors: [], };

  if (!config.enabled || config.templates.length === 0) {
    return result;
  }

  for (const template of config.templates) {
    try {
      const exists = await database
        .selectFrom("actors",)
        .select("id",)
        .where("display_name", "=", template.name,)
        .where((eb,) =>
          ownerId
            ? eb("owner_id", "=", ownerId,)
            : eb("owner_id", "is", null,)
        )
        .executeTakeFirst();

      if (exists) {
        result.skipped++;
        continue;
      }

      const id = uid();
      const tags = template.tags ?? [];
      const settingsResult = safeJsonStringify(tags.length > 0 ? { tags, } : {},);
      const settings = settingsResult.ok ? settingsResult.value : "{}";

      await database
        .insertInto("actors",)
        .values({
          id,
          actor_type: "character",
          display_name: template.name,
          user_id: ownerId,
          owner_id: ownerId,
          agent_type: "ai",
          description: template.description,
          personality: template.personality ?? null,
          scenario: template.scenario ?? null,
          welcome_message: template.welcome_message ?? null,
          system_prompt: template.system_prompt ?? null,
          mes_example: template.mes_example ?? null,
          creator: template.creator ?? null,
          settings,
          import_spec: "template",
          data_version: 0,
        },)
        .execute();

      result.created++;
      logger.info("seeded character template", { module: "characters", name: template.name, },);
    } catch (error_) {
      const error = error_ instanceof Error ? error_ : new Error(String(error_,),);
      result.errors.push(`${template.name}: ${error.message}`,);
      logger.error("failed to seed character template", error, { module: "characters", name: template.name, },);
    }
  }

  return result;
}
