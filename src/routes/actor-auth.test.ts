import { describe, expect, test, } from "bun:test";

import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../test-utils/insert-helpers";
import { checkActorOwnership, } from "./actor-auth";
import { requireUserId, } from "./http-utils";

describe("requireUserId", () => {
  test("returns the userId when the context is authenticated", () => {
    expect(requireUserId({ userId: "user-1", },),).toBe("user-1",);
  });

  test("returns a 401 Response when userId is missing", async () => {
    const res = requireUserId({ userId: null, },);
    expect(res,).toBeInstanceOf(Response,);
    expect((res as Response).status,).toBe(401,);
    const body = (await (res as Response).json()) as { error: string };
    expect(body.error,).toBe("Unauthorized",);
  });

  test("returns a 401 for an empty-string userId (falsy)", () => {
    const res = requireUserId({ userId: "", },);
    expect(res,).toBeInstanceOf(Response,);
  });

  test("uses the translator result for the unauthorized message when present", async () => {
    const res = requireUserId({
      userId: null,
      t: (key: string,) => (key === "errors.unauthorized" ? "Not signed in" : undefined),
    },) as Response;
    const body = (await res.json()) as { error: string };
    expect(body.error,).toBe("Not signed in",);
  });
});

describe("checkActorOwnership", () => {
  /**
   * @param db
   */
  async function seedActor(db: Awaited<ReturnType<typeof createTestDb>>["db"],) {
    await insertUsers(db, "user1", "User 1", { id: "user-1", } as never,);
    await insertActors(db, "Alice", { id: "actor-1", owner_id: "user-1", } as never,);
  }

  test("grant when user owns the actor", async () => {
    const { db, } = await createTestDb();
    await seedActor(db,);
    expect(await checkActorOwnership(db, "actor-1", "user-1", null,),).toBe(true,);
  });

  test("grant for admin role", async () => {
    const { db, } = await createTestDb();
    await seedActor(db,);
    expect(await checkActorOwnership(db, "actor-1", "user-2", "admin",),).toBe(true,);
  });

  test("grant for solo role", async () => {
    const { db, } = await createTestDb();
    await seedActor(db,);
    expect(await checkActorOwnership(db, "actor-1", "user-2", "solo",),).toBe(true,);
  });

  test("deny a non-owner without privileges", async () => {
    const { db, } = await createTestDb();
    await seedActor(db,);
    expect(await checkActorOwnership(db, "actor-1", "user-2", null,),).toBe(false,);
  });

  test("deny when the actor does not exist", async () => {
    const { db, } = await createTestDb();
    expect(await checkActorOwnership(db, "missing", "user-1", "admin",),).toBe(false,);
  });

  test("grant for tester role via permission matrix", async () => {
    const { db, } = await createTestDb();
    await seedActor(db,);
    // tester holds "*" in DEFAULT_PERMISSIONS → granted admin.character bypass.
    expect(await checkActorOwnership(db, "actor-1", "user-2", "tester",),).toBe(true,);
  });

  test("deny a moderator (no admin.character permission)", async () => {
    const { db, } = await createTestDb();
    await seedActor(db,);
    // moderator has chat.*/character.view/world.view — none grant admin.character.
    expect(await checkActorOwnership(db, "actor-1", "user-2", "moderator",),).toBe(false,);
  });
});
