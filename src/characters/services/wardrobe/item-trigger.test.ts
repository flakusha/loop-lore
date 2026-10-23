import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, } from "../../../test-utils/create-test-db";
import {
  insertActorItems,
  insertActors,
  insertActorWardrobe,
  insertUsers,
  insertWardrobeItems,
} from "../../../test-utils/insert-helpers";
import { uid, } from "../../../utils";
import type { OutfitChangeGate, } from "./change-gate";
import { triggerItemOutfitChange, } from "./item-trigger";

let db: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());
},);

afterAll(async () => {
  await db.destroy();
},);

describe("triggerItemOutfitChange", () => {
  test("routes one request for a bound item instance", async () => {
    const userId = uid();
    await insertUsers(
      db,
      `user-${userId}`,
      "U",
      { id: userId, role: "solo", status: "active", settings: "{}", } as never,
    );

    const actorId = uid();
    await insertActors(db, "A", { id: actorId, user_id: userId, } as never,);

    const itemId = await insertActorItems(db, actorId, "Cloak", "armor" as any,);

    const outfitId = await insertWardrobeItems(db, "Cloak", { actor_id: actorId, },);
    await insertActorWardrobe(db, actorId, outfitId, { item_instance_id: itemId, },);

    const seen: any[] = [];
    const gate: OutfitChangeGate = {
      review: (r,) => {
        seen.push(r,);
        return { allowed: true, };
      },
    };

    await triggerItemOutfitChange(db, actorId, itemId, gate,);
    expect(seen.length,).toBe(1,);
    expect(seen[0].actorId,).toBe(actorId,);
    expect(seen[0].initiator,).toBe("item",);
    expect(seen[0].fromOutfitId,).toBe(outfitId,);
  });

  test("no-op when item is not wardrobe-bound", async () => {
    const userId = uid();
    await insertUsers(
      db,
      `user-${userId}`,
      "U",
      { id: userId, role: "solo", status: "active", settings: "{}", } as never,
    );

    const actorId = uid();
    await insertActors(db, "A", { id: actorId, user_id: userId, } as never,);

    const itemId = await insertActorItems(db, actorId, "Sword", "weapon" as any,);

    const seen: any[] = [];
    const gate: OutfitChangeGate = {
      review: (r,) => {
        seen.push(r,);
        return { allowed: true, };
      },
    };

    await triggerItemOutfitChange(db, actorId, itemId, gate,);
    expect(seen.length,).toBe(0,);
  });

  test("does not throw and leaves row intact on gate failure", async () => {
    const userId = uid();
    await insertUsers(
      db,
      `user-${userId}`,
      "U",
      { id: userId, role: "solo", status: "active", settings: "{}", } as never,
    );

    const actorId = uid();
    await insertActors(db, "A", { id: actorId, user_id: userId, } as never,);

    const itemId = await insertActorItems(db, actorId, "Cloak", "armor" as any,);

    const outfitId = await insertWardrobeItems(db, "Cloak", { actor_id: actorId, },);
    await insertActorWardrobe(db, actorId, outfitId, { item_instance_id: itemId, },);

    const gate: OutfitChangeGate = {
      review: () => {
        throw new Error("boom",);
      },
    };

    await expect(triggerItemOutfitChange(db, actorId, itemId, gate,),).resolves.toBeUndefined();
  });
});
