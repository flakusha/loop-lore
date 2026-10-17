// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/resource-node.ts — node reads and yield resolution for extraction.
 *
 * Split out of `./resources` purely for size: these are the four queries the
 * engine runs around a roll, none of which is part of the public surface. They
 * all read the CRAFTING epic's tables — there is no node table of our own.
 */
import type { Kysely, Selectable, } from "kysely";
import { NodeInstanceState, } from "../db/enums";
import type { DB, } from "../db/schema";
import { ItemsService, } from "../story/items";
import { parseExpiryMs, toDate, } from "../utils/date";
import { type ExtractionYieldEntry, ResourceError, type Rng, } from "./resource-core";

/** One `gathering_node_instances` row as SELECT returns it. */
export type NodeInstanceRow = Selectable<DB["gathering_node_instances"]>;

/**
 * Load the node an attempt targets, scoped to its world.
 *
 * World scoping is the security boundary, not a convenience: without the
 * `world_id` predicate a node id guessed from another world would harvest
 * against this world's materials.
 * @param db Kysely handle
 * @param worldId world scope
 * @param nodeInstanceId the node to load
 * @returns the node row
 * @throws {ResourceError} `not-found` when absent or in another world,
 *   `depleted` when already spent and awaiting respawn
 */
export async function loadNode(
  db: Kysely<DB>,
  worldId: string,
  nodeInstanceId: string,
): Promise<NodeInstanceRow> {
  const node = await db
    .selectFrom("gathering_node_instances",)
    .selectAll()
    .where("id", "=", nodeInstanceId,)
    .where("world_id", "=", worldId,)
    .executeTakeFirst();

  if (!node) {
    throw new ResourceError("not-found", `node instance "${nodeInstanceId}" not found in world "${worldId}"`,);
  }

  if (node.state === NodeInstanceState.Depleted) {
    throw new ResourceError("depleted", `node instance "${nodeInstanceId}" is depleted`,);
  }

  return node;
}

/**
 * The node def's respawn interval in seconds.
 *
 * Read per call rather than memoized: one extra indexed read is cheaper than a
 * cache that goes stale the moment a designer tunes a node's respawn.
 * @param db Kysely handle
 * @param nodeDefId the def to read
 * @returns the interval, or 0 when the def has gone missing
 */
export async function respawnDelaySeconds(db: Kysely<DB>, nodeDefId: string,): Promise<number> {
  const def = await db
    .selectFrom("gathering_node_defs",)
    .select("respawn_time_seconds",)
    .where("id", "=", nodeDefId,)
    .executeTakeFirst();

  return def?.respawn_time_seconds ?? 0;
}

/**
 * Resolve what one successful swing produces from the node def's material
 * table. Each material is an independent drop-chance roll followed by a
 * quantity between its min and max, so a node with three materials can yield
 * zero, one, or all three.
 * @param db Kysely handle
 * @param nodeDefId the def whose materials to roll
 * @param rng the attempt's seeded generator, advanced by these rolls
 * @returns the items produced, in `sort_order`
 */
export async function rollYield(
  db: Kysely<DB>,
  nodeDefId: string,
  rng: Rng,
): Promise<ExtractionYieldEntry[]> {
  const materials = await db
    .selectFrom("gathering_node_materials",)
    .select(["item_id", "min_quantity", "max_quantity", "drop_chance", "sort_order",],)
    .where("node_def_id", "=", nodeDefId,)
    .orderBy("sort_order", "asc",)
    .execute();

  const produced: ExtractionYieldEntry[] = [];
  for (const material of materials) {
    if (rng() >= material.drop_chance) { continue; }

    const span = material.max_quantity - material.min_quantity;
    const quantity = material.min_quantity + (span > 0 ? Math.floor(rng() * (span + 1),) : 0);
    if (quantity > 0) { produced.push({ itemId: material.item_id, quantity, },); }
  }

  return produced;
}

/**
 * Write back a node consumed by one successful extraction.
 *
 * Lives here rather than in `./resources` because the respawn stamp is a
 * function of the def's timer, which needs its own read and must be awaited
 * BEFORE the update object is built.
 *
 * A NULL `remaining_amount` is INFINITE and is never written, so a renewable
 * node can neither deplete nor acquire a respawn stamp it does not need.
 * @param db Kysely handle
 * @param nodeInstanceId the node to update
 * @param node the pre-attempt row
 * @param nowIso the attempt instant
 * @returns `remaining_amount` after the attempt; NULL still means infinite
 */
export async function consumeNode(
  db: Kysely<DB>,
  nodeInstanceId: string,
  node: { remaining_amount: number | null; current_uses: number },
  nowIso: string,
): Promise<number | null> {
  if (node.remaining_amount === null) { return null; }

  const remaining = Math.max(0, node.remaining_amount - 1,);
  const spent = remaining === 0;
  await db
    .updateTable("gathering_node_instances",)
    .set({
      remaining_amount: remaining,
      current_uses: Math.max(0, node.current_uses - 1,),
      state: spent ? NodeInstanceState.Depleted : NodeInstanceState.Available,
      updated_at: nowIso,
      ...(spent ? { respawn_at: await nextRespawnAt(db, nodeInstanceId, nowIso,), } : {}),
    },)
    .where("id", "=", nodeInstanceId,)
    .execute();

  return remaining;
}

/** The instant a just-depleted node becomes harvestable again, derived from its
 * def's `respawn_time_seconds`. */
async function nextRespawnAt(db: Kysely<DB>, nodeInstanceId: string, nowIso: string,): Promise<string> {
  const node = await db
    .selectFrom("gathering_node_instances",)
    .select("node_def_id",)
    .where("id", "=", nodeInstanceId,)
    .executeTakeFirstOrThrow();

  const seconds = await respawnDelaySeconds(db, node.node_def_id,);

  return toDate(parseExpiryMs(nowIso,)! + seconds * 1000,).toISOString();
}

/**
 * Hand each yielded item to the actor as a `world_items` instance.
 *
 * Goes through the shared item service rather than inserting rows directly, so
 * an extracted ore obeys the same durability / unique-item rules as one handed
 * out by a quest.
 * @param db Kysely handle
 * @param worldId world scope
 * @param actorId who receives the items
 * @param produced the items to grant
 */
export async function grantYield(
  db: Kysely<DB>,
  worldId: string,
  actorId: string,
  produced: ExtractionYieldEntry[],
): Promise<void> {
  const items = new ItemsService(db,);
  for (const entry of produced) {
    await items.giveToNpc(entry.itemId, actorId, worldId, entry.quantity,);
  }
}
