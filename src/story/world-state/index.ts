// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World State Service
 *
 * Manage world state snapshots, NPC dynamic states, location
 * dynamic states, and the context assembly feed for the Game Master.
 *
 * Method bodies live in sibling dispatcher modules (context, init,
 * queries) threaded with an explicit `WorldState` handle. The class is
 * kept so the constructor-based public surface is unchanged.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { StoryContext, } from "../types";
import { buildContext as buildContextDispatch, } from "./context";
import {
  initializeCharacterWorldSetup as initializeCharacterWorldSetupDispatch,
  initializeLocationStates as initializeLocationStatesDispatch,
  initializeNpcStates as initializeNpcStatesDispatch,
  seedStartingInventory as seedStartingInventoryDispatch,
} from "./init";
import {
  getLocationState as getLocationStateDispatch,
  getNpcsAtLocation as getNpcsAtLocationDispatch,
  getNpcState as getNpcStateDispatch,
  snapshot as snapshotDispatch,
} from "./queries";
import type { WorldState, } from "./types";

export type { WorldState, } from "./types";

// ── World State Service ──────────────────────────────────────

/** */
export class WorldStateService {
  private readonly db: Kysely<DB>;

  /**
   * @param db
   */
  constructor(db: Kysely<DB>,) {
    this.db = db;
  }

  /** */
  private get state(): WorldState {
    return { db: this.db, };
  }

  /**
   * Build the full StoryContext for the Game Master
   * from the current DB state.
   * @param chatId
   * @param recentTurnCount
   * @returns the assembled context for the GM, or null if no turns exist for the chat
   */
  async buildContext(chatId: string, recentTurnCount = 10,): Promise<StoryContext | null> {
    return buildContextDispatch(this.state, chatId, recentTurnCount,);
  }

  /**
   * Initialize NPC dynamic states for all characters in a world
   * @param worldId
   * @returns the number of NPC state rows created or already present
   */
  async initializeNpcStates(worldId: string,): Promise<number> {
    return initializeNpcStatesDispatch(this.state, worldId,);
  }

  /**
   * Initialize per-world character setup rows for all characters in a world
   * @param worldId
   * @returns the number of character setup rows created or already present
   */
  async initializeCharacterWorldSetup(worldId: string,): Promise<number> {
    return initializeCharacterWorldSetupDispatch(this.state, worldId,);
  }

  /**
   * Seed world_items from each character's starting_inventory on first join
   * @param worldId
   * @returns the number of world_item rows created
   */
  async seedStartingInventory(worldId: string,): Promise<number> {
    return seedStartingInventoryDispatch(this.state, worldId,);
  }

  /**
   * Initialize location dynamic states for all locations in a world
   * @param worldId
   * @returns the number of location state rows created or already present
   */
  async initializeLocationStates(worldId: string,): Promise<number> {
    return initializeLocationStatesDispatch(this.state, worldId,);
  }

  /**
   * Take a state snapshot for rollback/history
   * @param worldId
   * @param turnId
   * @param messageId
   * @param description
   * @returns the snapshot id
   */
  async snapshot(
    worldId: string,
    turnId?: string,
    messageId?: string,
    description?: string,
  ): Promise<string> {
    return snapshotDispatch(this.state, worldId, turnId, messageId, description,);
  }

  /**
   * Get NPC state for a given actor in a world
   * @param actorId
   * @param worldId
   * @returns the NPC's dynamic state row, or null if not initialized
   */
  async getNpcState(actorId: string, worldId: string,) {
    return getNpcStateDispatch(this.state, actorId, worldId,);
  }

  /**
   * Get location state for a given location
   * @param locationId
   * @returns the location's dynamic state row, or null if not initialized
   */
  async getLocationState(locationId: string,) {
    return getLocationStateDispatch(this.state, locationId,);
  }

  /**
   * Get all NPCs at a given location
   * @param locationId
   * @returns all NPC state rows currently at this location
   */
  async getNpcsAtLocation(locationId: string,) {
    return getNpcsAtLocationDispatch(this.state, locationId,);
  }
}
