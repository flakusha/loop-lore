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
  initializeLocationStates as initializeLocationStatesDispatch,
  initializeNpcStates as initializeNpcStatesDispatch,
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

export class WorldStateService {
  private readonly db: Kysely<DB>;

  constructor(db: Kysely<DB>,) {
    this.db = db;
  }

  private get state(): WorldState {
    return { db: this.db, };
  }

  /**
   * Build the full StoryContext for the Game Master
   * from the current DB state.
   */
  async buildContext(chatId: string, recentTurnCount = 10,): Promise<StoryContext | null> {
    return buildContextDispatch(this.state, chatId, recentTurnCount,);
  }

  /** Initialize NPC dynamic states for all characters in a world */
  async initializeNpcStates(worldId: string,): Promise<number> {
    return initializeNpcStatesDispatch(this.state, worldId,);
  }

  /** Initialize location dynamic states for all locations in a world */
  async initializeLocationStates(worldId: string,): Promise<number> {
    return initializeLocationStatesDispatch(this.state, worldId,);
  }

  /** Take a state snapshot for rollback/history */
  async snapshot(
    worldId: string,
    turnId?: string,
    messageId?: string,
    description?: string,
  ): Promise<string> {
    return snapshotDispatch(this.state, worldId, turnId, messageId, description,);
  }

  /** Get NPC state for a given actor in a world */
  async getNpcState(actorId: string, worldId: string,) {
    return getNpcStateDispatch(this.state, actorId, worldId,);
  }

  /** Get location state for a given location */
  async getLocationState(locationId: string,) {
    return getLocationStateDispatch(this.state, locationId,);
  }

  /** Get all NPCs at a given location */
  async getNpcsAtLocation(locationId: string,) {
    return getNpcsAtLocationDispatch(this.state, locationId,);
  }
}
