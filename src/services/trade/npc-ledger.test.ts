// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NPC trading writes exactly one `trade_history` row per completed trade.
 *
 * `tradeCore` records the trade inside its own transaction. `buyFromNpc` and
 * `sellToNpc` used to append a SECOND row after `tradeCore` returned, so every
 * NPC trade double-counted in the ledger: one `player_player` row from core and
 * one `player_npc` / `npc_player` row from the wrapper.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertItems,
  insertUsers,
  insertWorldItems,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { credit, } from "./balance";
import { buyFromNpc, sellToNpc, } from "./npc";

let db: Kysely<DB>;
let worldId: string;
let player: string;
let npc: string;
let npcItem: string;
let playerItem: string;

/**
 * @param world - world the trade happened in
 * @returns every trade_history row for that world, oldest first
 */
async function ledger(world: string,) {
  return await db
    .selectFrom("trade_history",)
    .select(["id", "trade_type", "price", "buyer_actor_id", "seller_actor_id",],)
    .where("world_id", "=", world,)
    .orderBy("created_at", "asc",)
    .execute();
}

beforeAll(async () => {
  ({ db, } = await createTestDb());
  const userId = uid();
  await insertUsers(db, `u-${userId}`, "Owner", {
    id: userId as never,
    role: "solo" as never,
    status: "active" as never,
    settings: "{}" as never,
  },);

  worldId = uid();
  await insertWorlds(db, userId, "NPC Ledger World", { id: worldId as never, },);

  player = uid();
  npc = uid();
  for (const [id, name,] of [[player, "Player",], [npc, "Shopkeeper",],] as const) {
    await insertActors(db, name, {
      id: id as never,
      actor_type: "character" as never,
      user_id: userId,
      owner_id: userId,
      agent_type: "ai" as never,
      settings: "{}" as never,
    },);
  }

  const potion = uid();
  await insertItems(db, worldId, "Potion", "consumable", { id: potion as never, },);

  npcItem = uid();
  await insertWorldItems(db, worldId, potion, {
    id: npcItem as never,
    owner_actor_id: npc,
    quantity: 10 as never,
  },);

  playerItem = uid();
  await insertWorldItems(db, worldId, potion, {
    id: playerItem as never,
    owner_actor_id: player,
    quantity: 10 as never,
  },);
},);

afterAll(async () => {
  await db?.destroy();
},);

describe("NPC trade ledger", () => {
  test("buyFromNpc records exactly one player_npc row", async () => {
    await credit(db, player, worldId, 500,);
    const before = (await ledger(worldId,)).length;

    const result = await buyFromNpc(db, {
      worldId,
      buyerActorId: player,
      npcActorId: npc,
      sellerItems: [{ worldItemId: npcItem, quantity: 1, },],
      price: 25,
    },);

    expect(result.success,).toBe(true,);
    const rows = await ledger(worldId,);
    expect(rows.length - before,).toBe(1,);
    expect(rows.at(-1,)?.trade_type,).toBe("player_npc",);
    expect(rows.at(-1,)?.price,).toBe(25,);
  });

  test("sellToNpc records exactly one npc_player row", async () => {
    const before = (await ledger(worldId,)).length;

    const result = await sellToNpc(db, {
      worldId,
      sellerActorId: player,
      npcActorId: npc,
      buyerItems: [{ worldItemId: playerItem, quantity: 1, },],
      price: 15,
    },);

    expect(result.success,).toBe(true,);
    const rows = await ledger(worldId,);
    expect(rows.length - before,).toBe(1,);
    expect(rows.at(-1,)?.trade_type,).toBe("npc_player",);
    expect(rows.at(-1,)?.price,).toBe(15,);
  });
});
