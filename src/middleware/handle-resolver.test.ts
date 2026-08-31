import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import { createHandleResolver, } from "./handle-resolver";

describe("createHandleResolver", () => {
  let db: Kysely<DB>;

  beforeEach(async () => {
    db = (await createTestDb()).db;
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  /**
   * @param id
   * @param username
   */
  async function insertUser(id: string, username: string,): Promise<void> {
    await db.insertInto("users",)
      .values({ id, username, display_name: username, password_hash: null, role: "user", status: "active", },)
      .execute();
  }

  it("resolves username for known user", async () => {
    const id = uid();
    await insertUser(id, "alice",);
    const r = createHandleResolver(db,);
    expect(await r.resolve(id,),).toBe("alice",);
  });

  it("returns null for unknown user", async () => {
    const r = createHandleResolver(db,);
    expect(await r.resolve("nonexistent-id",),).toBeNull();
  });

  it("caches results across calls (rename not visible until invalidate)", async () => {
    const id = uid();
    await insertUser(id, "bob",);
    const r = createHandleResolver(db,);

    expect(await r.resolve(id,),).toBe("bob",);
    await db.updateTable("users",).set({ username: "bob2", },).where("id", "=", id,).execute();
    // Cache hit — still returns the old name.
    expect(await r.resolve(id,),).toBe("bob",);
  });

  it("invalidates cache for a single user via invalidateOne", async () => {
    const id = uid();
    await insertUser(id, "carol",);
    const r = createHandleResolver(db,);

    expect(await r.resolve(id,),).toBe("carol",);
    await db.updateTable("users",).set({ username: "carol2", },).where("id", "=", id,).execute();
    r.invalidateOne(id,);
    expect(await r.resolve(id,),).toBe("carol2",);
  });

  it("invalidates the whole cache via invalidate()", async () => {
    const id1 = uid();
    await insertUser(id1, "dave1",);
    const id2 = uid();
    await insertUser(id2, "dave2",);
    const r = createHandleResolver(db,);

    expect(await r.resolve(id1,),).toBe("dave1",);
    expect(await r.resolve(id2,),).toBe("dave2",);

    await db.updateTable("users",).set({ username: "dave1-new", },).where("id", "=", id1,).execute();
    await db.updateTable("users",).set({ username: "dave2-new", },).where("id", "=", id2,).execute();
    r.invalidate();
    expect(await r.resolve(id1,),).toBe("dave1-new",);
    expect(await r.resolve(id2,),).toBe("dave2-new",);
  });

  it("caps cache size and evicts oldest entry first (FIFO)", async () => {
    const r = createHandleResolver(db, { maxEntries: 2, ttlMs: 60_000, },);
    const id1 = uid();
    const id2 = uid();
    const id3 = uid();
    await insertUser(id1, "x1",);
    await insertUser(id2, "x2",);

    // Cache id1, id2
    expect(await r.resolve(id1,),).toBe("x1",);
    expect(await r.resolve(id2,),).toBe("x2",);

    // Insert id3 — should evict id1 (FIFO)
    await insertUser(id3, "x3",);
    expect(await r.resolve(id3,),).toBe("x3",);

    // Rename id1 — if id1 were still cached, we'd see "x1" (stale).
    // After eviction, the next resolve(id1) hits DB and sees the new name.
    await db.updateTable("users",).set({ username: "x1-new", },).where("id", "=", id1,).execute();
    expect(await r.resolve(id1,),).toBe("x1-new",);
  });
});
