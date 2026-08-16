// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/importers/character-systems/availability.ts — Import availability data

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { jsonStringifyOr, } from "../../../utils";
import type { CharacterSystemsExport, } from "../../exporters/character-systems";
import { errMsg, } from "../../shared/character-systems-utils";
import type { CharacterSystemsImportResult, } from "./types";

/** Import availability into the character systems importer result. */
export async function importAvailability(
  db: Kysely<DB>,
  actorId: string,
  data: CharacterSystemsExport["availability"],
  result: CharacterSystemsImportResult,
): Promise<void> {
  if (!data) { return; }

  try {
    const existing = await db.selectFrom("character_availability",).where("actor_id", "=", actorId,).select("id",)
      .executeTakeFirst();
    const now = new Date().toISOString();
    if (existing) {
      await db.updateTable("character_availability",).set({
        status: data.status as any,
        usage_policy: jsonStringifyOr(data.usagePolicy ?? {},),
        activity_restrictions: jsonStringifyOr(data.activityRestrictions ?? {},),
        content_policy: jsonStringifyOr(data.contentPolicy ?? {},),
        nsfw_policy: jsonStringifyOr(data.nsfwPolicy ?? {},),
        updated_at: now,
      },).where("actor_id", "=", actorId,).execute();
    } else {
      await db.insertInto("character_availability",).values({
        id: crypto.randomUUID(),
        actor_id: actorId,
        status: data.status as any,
        usage_policy: jsonStringifyOr(data.usagePolicy ?? {},),
        activity_restrictions: jsonStringifyOr(data.activityRestrictions ?? {},),
        content_policy: jsonStringifyOr(data.contentPolicy ?? {},),
        nsfw_policy: jsonStringifyOr(data.nsfwPolicy ?? {},),
        created_at: now,
        updated_at: now,
      },).execute();
    }
    result.availabilityImported = true;
  } catch (error: unknown) {
    result.errors.push(`Failed to import availability: ${errMsg(error,)}`,);
  }
}
