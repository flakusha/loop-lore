// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/resources.ts — resource extraction (mining / gathering / fishing).
 *
 * Extraction runs on the CRAFTING EPIC'S NODE TABLES. There is no second node
 * concept here: `gathering_node_defs` names the template, `gathering_node_materials`
 * lists what it yields, and `gathering_node_instances` is the concrete thing on
 * the map that gets rolled against. Migration 060 added exactly the three
 * fields this engine needed and the crafting schema lacked — `quality`,
 * `extraction_difficulty`, `remaining_amount` — so both systems read and write
 * ONE set of nodes.
 *
 * WHAT A SUCCESS CONSUMES
 * -----------------------
 * A success decrements `remaining_amount` and `current_uses`. A NULL
 * `remaining_amount` means INFINITE and is never written, so a renewable node
 * (a river, a seam) cannot be driven negative or into a bogus respawn. A FAILED
 * attempt consumes NOTHING — no decrement, no respawn stamp, no items — because
 * a swing that missed never removed ore.
 *
 * Every attempt, pass or fail, appends to `extraction_rolls` and emits a world
 * event, so difficulty tuning stays diagnosable after the fact.
 *
 * The roll itself is pure (`./resource-core`); the queries around it are in
 * (`./resource-node`). This module is the public surface.
 */
import type { Kysely, } from "kysely";
import { NodeInstanceState, } from "../db/enums";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { emitWorldEvent, } from "../rpg/world-discovery/events";
import { discoveryDb, } from "../rpg/world-discovery/types";
import { jsonParseOr, jsonStringifyOr, } from "../utils";
import {
  calculateExtractionDifficulty,
  type ExtractionActorModifiers,
  type ExtractionNodeState,
  type ExtractionYieldEntry,
  mulberry32,
  ResourceError,
  rollExtraction,
} from "./resource-core";
import { consumeNode, grantYield, loadNode, rollYield, } from "./resource-node";

/** Event type for one recorded extraction attempt. */
export const EXTRACTION_ROLLED = "resource:extracted";

/** A node as the listing reports it: the instance plus the def fields that
 * describe what kind of node it is. */
export interface ResourceListEntry {
  nodeInstanceId: string;
  nodeDefId: string;
  locationId: string | null;
  name: string;
  nodeType: string;
  quality: string;
  /** NULL = infinite. */
  remainingAmount: number | null;
  state: string;
  respawnAt: string | null;
}

/** The outcome of one extraction attempt. */
export interface ExtractionResult {
  succeeded: boolean;
  /** The DC this attempt was resolved against. */
  difficulty: number;
  /** Items produced. Always empty on failure. */
  yield: ExtractionYieldEntry[];
  /** `remaining_amount` after the attempt; NULL still means infinite. */
  remaining: number | null;
}

/** How many nodes a regeneration sweep restored. */
export interface RegenerateResult {
  regenerated: number;
}

/**
 * List every harvestable node at a location.
 * @param db Kysely handle
 * @param worldId world scope
 * @param locationId the location to list nodes at
 * @returns the nodes at that location, depleted ones included so a caller can
 *   render them as unavailable rather than silently hide them
 */
export async function listResources(
  db: Kysely<DB>,
  worldId: string,
  locationId: string,
): Promise<ResourceListEntry[]> {
  const rows = await db
    .selectFrom("gathering_node_instances",)
    .innerJoin("gathering_node_defs", "gathering_node_defs.id", "gathering_node_instances.node_def_id",)
    .select([
      "gathering_node_instances.id as node_instance_id",
      "gathering_node_instances.node_def_id",
      "gathering_node_instances.location_id",
      "gathering_node_instances.remaining_amount",
      "gathering_node_instances.state",
      "gathering_node_instances.respawn_at",
      "gathering_node_instances.quality",
      "gathering_node_defs.name",
      "gathering_node_defs.node_type",
    ],)
    .where("gathering_node_instances.world_id", "=", worldId,)
    .where("gathering_node_instances.location_id", "=", locationId,)
    .orderBy("gathering_node_defs.name", "asc",)
    .execute();

  return rows.map((row,) => ({
    nodeInstanceId: row.node_instance_id,
    nodeDefId: row.node_def_id,
    locationId: row.location_id,
    name: row.name,
    nodeType: row.node_type,
    quality: row.quality,
    remainingAmount: row.remaining_amount,
    state: row.state,
    respawnAt: row.respawn_at,
  }));
}

/**
 * Attempt one extraction against a node.
 *
 * Deterministic: the same `rngSeed` and `now` produce the same verdict and the
 * same yield on every run, which is what makes a retry, a replayed tick and a
 * test agree about what happened.
 *
 * @param db Kysely handle
 * @param worldId world scope
 * @param locationId where the attempt happens
 * @param nodeInstanceId the node to harvest
 * @param actorId who is attempting
 * @param options optional `abilityBonus`, `rngSeed`, `now`
 * @returns the verdict, DC, yield, and the node's remaining amount after
 * @throws {ResourceError} `not-found` when the node is absent or in another
 *   world, `depleted` when the node is spent and awaiting respawn
 */
export async function attemptExtraction(
  db: Kysely<DB>,
  worldId: string,
  locationId: string,
  nodeInstanceId: string,
  actorId: string,
  options: { abilityBonus?: number; rngSeed?: number; now?: Date } = {},
): Promise<ExtractionResult> {
  const node = await loadNode(db, worldId, nodeInstanceId,);
  const rng = mulberry32(options.rngSeed ?? 0,);
  const attemptedAt = (options.now ?? new Date()).toISOString();

  const nodeState: ExtractionNodeState = {
    extraction_difficulty: node.extraction_difficulty,
    quality: node.quality,
    remaining_amount: node.remaining_amount,
    state: node.state,
  };

  const modifiers: ExtractionActorModifiers = { abilityBonus: options.abilityBonus, };
  const difficulty = calculateExtractionDifficulty(nodeState, modifiers,);
  const attempt = rollExtraction(difficulty, rng,);

  // A failure consumes NOTHING: no yield, no decrement, no respawn stamp.
  const produced = attempt.succeeded ? await rollYield(db, node.node_def_id, rng,) : [];
  let remaining = node.remaining_amount;
  let succeeded = attempt.succeeded;

  if (attempt.succeeded) {
    try {
      remaining = await consumeNode(db, nodeInstanceId, node, attemptedAt,);
      await grantYield(db, worldId, actorId, produced,);
    } catch (error) {
      // A concurrent extraction spent the last unit between our read and the
      // guarded decrement. Paying out anyway IS the double-yield that guard
      // exists to prevent, so this attempt yields nothing — it is recorded and
      // reported as a failure rather than aborting before the roll is logged.
      if (!(error instanceof ResourceError) || error.code !== "depleted") { throw error; }

      succeeded = false;
      remaining = 0;
    }
  }

  await db
    .insertInto("extraction_rolls",)
    .values({
      world_id: worldId,
      location_id: locationId,
      node_instance_id: nodeInstanceId,
      actor_id: actorId,
      attempted_at: attemptedAt,
      succeeded: succeeded ? 1 : 0,
      difficulty,
      yield: jsonStringifyOr(succeeded ? produced : [], "[]",),
    },)
    .execute();

  await emitWorldEvent(discoveryDb(db,), {
    worldId,
    eventType: EXTRACTION_ROLLED,
    subjectId: nodeInstanceId,
    actorId,
    tick: 0,
    payload: { difficulty, roll: attempt.roll, succeeded, remaining, },
    dedupeKey: `extraction:${worldId}:${nodeInstanceId}:${actorId}:${attemptedAt}`,
  },);

  getLogger().debug("extraction attempted", {
    worldId,
    nodeInstanceId,
    difficulty,
    succeeded,
  },);

  return { succeeded, difficulty, yield: succeeded ? produced : [], remaining, };
}

/**
 * Restore every node in ONE world whose respawn window has elapsed.
 *
 * Respects the def's `respawn_time_seconds` through the instance's `respawn_at`:
 * only rows already stamped depleted AND past their stamp are touched, so a
 * node that has not waited out its timer is left alone.
 *
 * The sweep is world-scoped on purpose: the route gates it with
 * `requireWorldOwner` for the world in the path, so an unscoped UPDATE would
 * touch every world's nodes under a single world's owner gate. The sibling
 * `expireAnomalies` takes an optional `worldId` for the same reason.
 *
 * @param db Kysely handle
 * @param options `now` fixes the clock; `worldId` bounds the sweep
 * @returns how many nodes were restored
 */
export async function regenerateResources(
  db: Kysely<DB>,
  options: { now?: Date; worldId: string },
): Promise<RegenerateResult> {
  const now = (options.now ?? new Date()).toISOString();

  const result = await db
    .updateTable("gathering_node_instances",)
    .set({ state: NodeInstanceState.Available, respawn_at: null, updated_at: now, },)
    .where("world_id", "=", options.worldId,)
    .where("state", "=", NodeInstanceState.Depleted,)
    .where("respawn_at", "is not", null,)
    .where("respawn_at", "<=", now,)
    .executeTakeFirst();

  const regenerated = Number(result.numUpdatedRows ?? 0n,);
  if (regenerated > 0) { getLogger().info("regenerated gathering nodes", { regenerated, },); }

  return { regenerated, };
}

/** Decode a stored `extraction_rolls.yield` blob back into entries. */
export function parseStoredYield(raw: string,): ExtractionYieldEntry[] {
  return jsonParseOr<ExtractionYieldEntry[]>(raw, [],);
}

/** Re-exported so callers get the whole extraction surface from one module. */
export {
  calculateExtractionDifficulty,
  MAX_ABILITY_BONUS,
  mulberry32,
  ResourceError,
  rollExtraction,
} from "./resource-core";
export type { ExtractionActorModifiers, ExtractionNodeState, ExtractionYieldEntry, } from "./resource-core";
