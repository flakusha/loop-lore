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
   */
  /**
   * @param {string} chatId
   * @param {unknown} recentTurnCount
   * @returns {Promise<StoryContext | null>}
   */
  async buildContext(chatId: string, recentTurnCount = 10,): Promise<StoryContext | null> {
    return buildContextDispatch(this.state, chatId, recentTurnCount,);
  }

  /**
   * Initialize NPC dynamic states for all characters in a world
   * @param worldId
   */
  /**
   * @param {string} worldId
   * @returns {Promise<number>}
   */
  async initializeNpcStates(worldId: string,): Promise<number> {
    return initializeNpcStatesDispatch(this.state, worldId,);
  }

  /**
   * Initialize per-world character setup rows for all characters in a world
   * @param worldId
   */
  /**
   * @param {string} worldId
   * @returns {Promise<number>}
   */
  async initializeCharacterWorldSetup(worldId: string,): Promise<number> {
    return initializeCharacterWorldSetupDispatch(this.state, worldId,);
  }

  /**
   * Seed world_items from each character's starting_inventory on first join
   * @param worldId
   */
  /**
   * @param {string} worldId
   * @returns {Promise<number>}
   */
  async seedStartingInventory(worldId: string,): Promise<number> {
    return seedStartingInventoryDispatch(this.state, worldId,);
  }

  /**
   * Initialize location dynamic states for all locations in a world
   * @param worldId
   */
  /**
   * @param {string} worldId
   * @returns {Promise<number>}
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
   */
  /**
   * @param {string} worldId
   * @param {string} turnId
   * @param {string} messageId
   * @param {string} description
   * @returns {Promise<string>}
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
   */
  /**
   * @param {string} actorId
   * @param {string} worldId
   * @returns {Promise<{ id: string; actor_id: string; created_at: string; updated_at: string; world_id: string; relationships: string; health: number; location_id: string | null; mental_state: string; knowledge: string; inventory: string; schedule: string; } | undefined>}
   */
  async getNpcState(actorId: string, worldId: string,) {
    return getNpcStateDispatch(this.state, actorId, worldId,);
  }

  /**
   * Get location state for a given location
   * @param locationId
   */
  /**
   * @param {string} locationId
   * @returns {Promise<{ id: string; created_at: string; updated_at: string; world_id: string; weather: string | null; location_id: string; description_override: string | null; atmosphere: string | null; npcs_present: string; items_available: string; time_of_day: string | null; hazards: string; } | undefined>}
   */
  async getLocationState(locationId: string,) {
    return getLocationStateDispatch(this.state, locationId,);
  }

  /**
   * Get all NPCs at a given location
   * @param locationId
   */
  /**
   * @param {string} locationId
   * @returns {Promise<{ display_name: string; agent_type: AgentType; actor_id: string; health: number; mental_state: string; }[]>}
   */
  async getNpcsAtLocation(locationId: string,) {
    return getNpcsAtLocationDispatch(this.state, locationId,);
  }
}
