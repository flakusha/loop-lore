// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/importers/character-systems/world-setup.ts — Import world setup

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import type { CharacterSystemsExport, } from "../../exporters/character-systems";
import { errMsg, } from "../../shared/character-systems-utils";
import { CharacterWorldSetupService, } from "../../world-setup";
import type { CharacterSystemsImportResult, } from "./types";

/**
 * Import the per-world setup bundle (`character_world_setup`) for a character.
 *
 * World setup is scoped to a (actor, world) pair, so it is a no-op unless a
 * `worldId` is provided. Uses the same upsert the API routes use, so imports
 * merge idempotently into any existing bundle.
 */
export async function importWorldSetup(
  db: Kysely<DB>,
  actorId: string,
  data: CharacterSystemsExport["worldSetup"],
  result: CharacterSystemsImportResult,
  worldId?: string,
): Promise<void> {
  if (!data || !worldId) { return; }

  try {
    await CharacterWorldSetupService(db,).upsertWorldSetup({
      actorId,
      worldId,
      startingInventory: data.startingInventory ?? [],
      loreEntries: data.loreEntries ?? [],
      backstory: data.backstory ?? null,
      scenarioOverride: data.scenarioOverride ?? null,
      systemPromptOverride: data.systemPromptOverride ?? null,
      initialState: data.initialState ?? {},
    },);
    result.worldSetupImported = true;
  } catch (error: unknown) {
    result.errors.push(`Failed to import world setup: ${errMsg(error,)}`,);
  }
}
