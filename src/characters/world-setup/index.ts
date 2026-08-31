// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character World Setup Service — factory + merged public API
 *
 * Splits the per-world character setup bundle into standalone dispatcher
 * functions (CRUD + resolution) threaded with an explicit `thisL` context,
 * reassembled here by a factory. `CharacterWorldSetupService` is a single
 * source of truth: the interface IS the API type and the factory value shares
 * the same exported name (TS declaration merge), so there is no parallel
 * interface to maintain.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import {
  deleteWorldSetup,
  getWorldSetup,
  updateWorldSetup,
  upsertWorldSetup,
} from "./crud";
import { resolveCharacterWorldSetup, } from "./resolve";
import type {
  CharacterWorldSetupContext,
  CharacterWorldSetupService as CharacterWorldSetupServiceIface,
} from "./types";

/** Public API type — merged with the factory value below. */
// The empty interface is intentional: it merges the factory value with a
// same-named type so one name is both API type and constructor.

export interface CharacterWorldSetupService extends CharacterWorldSetupServiceIface {}

export type {
  CharacterWorldSetupRow,
  CreateWorldSetupInput,
  ResolvedCharacterWorldSetup,
  UpdateWorldSetupInput,
  WorldSetupInventoryItem,
  WorldSetupLoreEntry,
} from "./types";

/**
 * Create a CharacterWorldSetupService instance.
 * @param db - The database handle
 * @returns A service bound to the given database
 */
export function CharacterWorldSetupService(db: Kysely<DB>,): CharacterWorldSetupService {
  const self: CharacterWorldSetupContext = {
    db,
    getWorldSetup: (actorId, worldId,) => getWorldSetup({ thisL: self, actorId, worldId, },),
    upsertWorldSetup: (input,) => upsertWorldSetup({ thisL: self, input, },),
    updateWorldSetup: (actorId, worldId, input,) => updateWorldSetup({ thisL: self, actorId, worldId, input, },),
    deleteWorldSetup: (actorId, worldId,) => deleteWorldSetup({ thisL: self, actorId, worldId, },),
    resolveCharacterWorldSetup: (actorId, worldId,) => resolveCharacterWorldSetup({ thisL: self, actorId, worldId, },),
  };
  return self;
}
