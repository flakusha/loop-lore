// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type Kysely, } from "kysely";
import type { LocationEdgeMode as LocationEdgeModeType, } from "../db/enums-story/world";
import type { DB, } from "../db/schema";
import { safeJsonParse, } from "../utils";
import { EDGE_MODE_SET, type EdgeCost, LocationEdgeError, parseEdgeCost, sqlStamp, } from "./edge-core";
import { freeJumpOnCooldown, latchDiscovered, recordHop, } from "./edge-discovery";

/** Accepted mode strings for the travel body. */
const TRAVEL_MODES = EDGE_MODE_SET;

/** Outcome of one executed hop. */
export interface EdgeTravelOutcome {
  edgeId: string;
  actorId: string;
  toId: string;
  mode: string;
  /** Gold deducted for a free-jump; null for plain adjacency modes. */
  goldCharged: number | null;
}

/**
 * Execute one hop over a location edge for a player actor
 * (TASK-location-travel-connected-fast-and-free-jump): adjacency modes
 * walk/ride/fly/teleport/port-gate require the edge to exist; `free-jump`
 * additionally honors cost_json — gold via actor_currencies, cooldown via
 * the world event log.
 */
export class EdgeTravelService {
  /** @param database Kysely handle */
  constructor(private readonly database: Kysely<DB>,) {}

  /**
   * Resolve the actor a travel act is performed by. An explicit actorId
   * must belong to the caller; otherwise the caller's first actor stands
   * in. Users without any actor cannot travel.
   * @param userId acting user
   * @param actorIdHint optional explicit actor
   * @returns {Promise<string>} the actor id
   * @throws {LocationEdgeError} "not-found" (foreign actor) or
   *   "missing-actor" (user has no actor)
   */
  async resolveActor(userId: string, actorIdHint?: string | null,): Promise<string> {
    if (actorIdHint) {
      const owned = await this.database
        .selectFrom("actors",)
        .select("id",)
        .where("id", "=", actorIdHint,)
        .where("user_id", "=", userId,)
        .executeTakeFirst();

      if (!owned) {
        throw new LocationEdgeError("not-found", "Actor not found for this user",);
      }

      return actorIdHint;
    }

    const first = await this.database
      .selectFrom("actors",)
      .select("id",)
      .where("user_id", "=", userId,)
      .orderBy("created_at", "asc",)
      .executeTakeFirst();

    if (!first) {
      throw new LocationEdgeError("missing-actor", "User has no actor to travel with",);
    }

    return first.id;
  }

  /**
   * True when both edge endpoints carry the actor's discovery latch.
   * @param worldId world
   * @param fromId origin location
   * @param toId destination location
   * @param actorId traveling actor
   * @returns {Promise<boolean>} whether both endpoints are latched
   */
  async bothDiscovered(worldId: string, fromId: string, toId: string, actorId: string,): Promise<boolean> {
    const rows = await this.database
      .selectFrom("location_discovery",)
      .select("location_id",)
      .where("world_id", "=", worldId,)
      .where("actor_id", "=", actorId,)
      .where("discovered", "=", 1,)
      .where("location_id", "in", [fromId, toId,],)
      .execute();

    return rows.length === 2;
  }

  /**
   * Move the actor's actor_locations row to the destination (inserting a
   * row when the actor has never been placed) and latch discovery for it.
   * @param toId destination location
   * @param actorId traveling actor
   */
  async placeActor(toId: string, actorId: string,): Promise<void> {
    const updated = await this.database
      .updateTable("actor_locations",)
      .set({
        physical_location_id: toId,
        spatial_location_id: toId,
        entered_at: sqlStamp(new Date(),),
      },)
      .where("actor_id", "=", actorId,)
      .executeTakeFirst();

    if (updated.numUpdatedRows === 0n) {
      await this.database
        .insertInto("actor_locations",)
        .values({
          actor_id: actorId,
          physical_location_id: toId,
          spatial_location_id: toId,
        },)
        .onConflict((oc,) =>
          oc.column("actor_id",).doUpdateSet({
            physical_location_id: toId,
            spatial_location_id: toId,
            entered_at: sqlStamp(new Date(),),
          },)
        )
        .execute();
    }
  }

  /**
   * Charge the gold component of a free-jump cost from the actor's
   * `actor_currencies` wallet (`gold` currency type).
   * @param worldId world
   * @param actorId paying actor
   * @param gold amount to deduct
   * @returns {Promise<number>} the remaining balance
   * @throws {LocationEdgeError} "insufficient" when the wallet is short
   */
  async chargeGold(worldId: string, actorId: string, gold: number,): Promise<number> {
    const wallet = await this.database
      .selectFrom("actor_currencies",)
      .select("balance",)
      .where("actor_id", "=", actorId,)
      .where("world_id", "=", worldId,)
      .where("currency_type", "=", "gold",)
      .executeTakeFirst();

    const balance = wallet?.balance ?? 0;
    if (balance < gold) {
      throw new LocationEdgeError("insufficient", "Insufficient gold for free-jump",);
    }

    await this.database
      .updateTable("actor_currencies",)
      .set({ balance: balance - gold, updated_at: sqlStamp(new Date(),), },)
      .where("actor_id", "=", actorId,)
      .where("world_id", "=", worldId,)
      .where("currency_type", "=", "gold",)
      .execute();

    return balance - gold;
  }

  /**
   * Perform the hop end-to-end.
   * @param params travel request
   * @param params.worldId owning world
   * @param params.fromId origin location
   * @param params.toId destination location
   * @param params.mode requested travel mode
   * @param params.actorId traveling actor
   * @param params.bypassDiscovery world owner / platform admin gate bypass
   * @returns {Promise<EdgeTravelOutcome>} what happened
   * @throws {LocationEdgeError} per the class doc ordering
   */
  async travel(params: {
    worldId: string;
    fromId: string;
    toId: string;
    mode: string;
    actorId: string;
    bypassDiscovery: boolean;
  },): Promise<EdgeTravelOutcome> {
    const { worldId, fromId, toId, mode, actorId, bypassDiscovery, } = params;
    if (!TRAVEL_MODES.has(mode,)) {
      throw new LocationEdgeError("not-found", "No such edge for the requested travel",);
    }

    const typedMode = mode as LocationEdgeModeType;

    const edge = await this.database
      .selectFrom("location_edges",)
      .selectAll()
      .where("from_id", "=", fromId,)
      .where("to_id", "=", toId,)
      .where("mode", "=", typedMode,)
      .where("world_id", "=", worldId,)
      .executeTakeFirst();

    if (!edge) {
      throw new LocationEdgeError("not-found", "No such edge for the requested travel",);
    }

    if (edge.requires_discovery === 1 && !bypassDiscovery) {
      const open = await this.bothDiscovered(worldId, fromId, toId, actorId,);
      if (!open) {
        throw new LocationEdgeError("not-yet-discovered", "not-yet-discovered",);
      }
    }

    let goldCharged: number | null = null;
    if (mode === "free-jump") {
      const cost = parseOrThrow(edge.cost_json,);
      if (cost.cooldownHours !== undefined) {
        const cooling = await freeJumpOnCooldown(this.database, worldId, edge.id, actorId, cost.cooldownHours,);
        if (cooling) {
          throw new LocationEdgeError("cooldown", "This free-jump is still cooling down",);
        }
      }

      if (cost.itemId !== undefined || cost.requiresFactionStanding !== undefined) {
        // Honored by the party travel engine (epic-party-migration); the
        // user-level wallet for items/faction standing does not exist yet.
        throw new LocationEdgeError(
          "bad-cost",
          "itemId/requiresFactionStanding costs require the party economy",
        );
      }

      if (cost.gold !== undefined) {
        await this.chargeGold(worldId, actorId, cost.gold,);
        goldCharged = cost.gold;
      }
    }

    await this.placeActor(toId, actorId,);
    await latchDiscovered(this.database, worldId, toId, actorId,);
    await recordHop(this.database, worldId, edge.id, actorId, mode, fromId, toId,);

    return { edgeId: edge.id, actorId, toId, mode, goldCharged, };
  }
}

/**
 * @param costJson raw column value
 * @returns {EdgeCost} parsed cost
 * @throws {LocationEdgeError} "bad-cost" on malformed JSON
 */
function parseOrThrow(costJson: string,): EdgeCost {
  const parsed = safeJsonParse<EdgeCost>(costJson,);
  if (!parsed.ok) {
    throw new LocationEdgeError("bad-cost", "Edge cost is not valid JSON",);
  }

  return parseEdgeCost(parsed.value,);
}
