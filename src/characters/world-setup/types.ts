// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character World Setup Service — types
 *
 * Shared types for the per-world character setup bundle (Layer 2 overlay),
 * the `CharacterWorldSetupService` interface, and the dispatcher context.
 */
import type { Kysely, Selectable, } from "kysely";
import type { DB, } from "../../db/schema";

/** DB row for a per-(actor, world) setup bundle. */
export type CharacterWorldSetupRow = Selectable<DB["character_world_setup"]>;

/** An item the character begins with in this world (starting inventory). */
export interface WorldSetupInventoryItem {
  item_id: string;
  name?: string;
  quantity: number;
  equipped?: boolean;
  metadata?: Record<string, unknown>;
}

/** A world-scoped character lore entry (keys + content). */
export interface WorldSetupLoreEntry {
  name?: string;
  keys: string[];
  content: string;
  enabled?: boolean;
  constant?: boolean;
  priority?: number;
}

/** Options for creating or upserting a world setup bundle. */
export interface CreateWorldSetupInput {
  actorId: string;
  worldId: string;
  startingInventory?: WorldSetupInventoryItem[];
  loreEntries?: WorldSetupLoreEntry[];
  backstory?: string | null;
  scenarioOverride?: string | null;
  systemPromptOverride?: string | null;
  initialState?: Record<string, unknown>;
}

/** Options for updating an existing world setup bundle. */
export interface UpdateWorldSetupInput {
  startingInventory?: WorldSetupInventoryItem[];
  loreEntries?: WorldSetupLoreEntry[];
  backstory?: string | null;
  scenarioOverride?: string | null;
  systemPromptOverride?: string | null;
  initialState?: Record<string, unknown>;
}

/**
 * Resolved character setup for a specific world — base `actors` setup merged
 * with the `character_world_setup` overlay. Non-null overrides win; the base
 * value is preserved alongside so callers can diff.
 */
export interface ResolvedCharacterWorldSetup {
  actorId: string;
  worldId: string;
  baseScenario: string | null;
  baseSystemPrompt: string | null;
  scenario: string | null;
  systemPrompt: string | null;
  backstory: string | null;
  startingInventory: WorldSetupInventoryItem[];
  loreEntries: WorldSetupLoreEntry[];
  initialState: Record<string, unknown>;
}

/**
 * The full world-setup service context handed to dispatchers as `thisL`.
 * The public API plus the db handle, so any dispatcher can reach sibling
 * methods and the database.
 */
export type CharacterWorldSetupContext = CharacterWorldSetupService & { db: Kysely<DB> };

/**
 * Character World Setup Service — public API.
 */
export interface CharacterWorldSetupService {
  getWorldSetup(actorId: string, worldId: string,): Promise<CharacterWorldSetupRow | undefined>;
  upsertWorldSetup(input: CreateWorldSetupInput,): Promise<CharacterWorldSetupRow>;
  updateWorldSetup(
    actorId: string,
    worldId: string,
    input: UpdateWorldSetupInput,
  ): Promise<CharacterWorldSetupRow | undefined>;
  deleteWorldSetup(actorId: string, worldId: string,): Promise<boolean>;
  resolveCharacterWorldSetup(
    actorId: string,
    worldId: string,
  ): Promise<ResolvedCharacterWorldSetup | undefined>;
}
