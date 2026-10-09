/**
 * Tests for the shared location-move plumbing (location-tree-move.ts):
 * world-scoped row loading and LocationMoveError → HTTP status mapping.
 * TASK-location-crud-tree-connections regression coverage for the helper
 * both the move and reparent HTTP paths go through.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertLocations, insertWorlds, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { moveLocationOrError, } from "./location-tree-move";

describe("moveLocationOrError", () => {
  let db: Kysely<DB>;
  let sqlite: { close(): void };
  let worldId: string;
  let rootId: string;
  let root2Id: string;
  let childId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    const testDb = await createTestDb();
    db = testDb.db;
    sqlite = testDb.sqlite;

    const ownerId = uid();
    await db
      .insertInto("users",)
      .values({
        id: ownerId,
        username: `user-${ownerId}`,
        display_name: "Owner",
        role: "solo",
        status: "active",
        settings: "{}",
      },)
      .execute();

    worldId = uid();
    await insertWorlds(db, ownerId, "Move Helper World", { id: worldId, } as never,);

    rootId = await insertLocations(db, worldId, "Root",);
    root2Id = await insertLocations(db, worldId, "Root Two",);
    childId = await insertLocations(db, worldId, "Child", { parent_location_id: rootId, },);
  },);

  afterAll(() => {
    sqlite.close();
  },);

  test("moves a subtree and resolves null on success", async () => {
    const err = await moveLocationOrError(db, worldId, childId, root2Id, ["not-found",],);
    expect(err,).toBeNull();

    const moved = await db
      .selectFrom("locations",)
      .where("id", "=", childId,)
      .select("parent_location_id",)
      .executeTakeFirst();

    expect(moved?.parent_location_id,).toBe(root2Id,);
  });

  test("maps an absent location to a 404 response", async () => {
    const err = await moveLocationOrError(db, worldId, uid(), rootId, ["not-found",],);
    expect(err,).not.toBeNull();
    expect(err!.status,).toBe(404,);
  });

  test("maps a self-parent cycle to a 400 response", async () => {
    const err = await moveLocationOrError(db, worldId, rootId, rootId, ["not-found",],);
    expect(err,).not.toBeNull();
    expect(err!.status,).toBe(400,);
  });
});
