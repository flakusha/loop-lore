import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActorMemories, insertActors, insertUsers, } from "../test-utils/insert-helpers";
import {
  createActorMemory,
  deleteActorMemory,
  listActorMemories,
  updateActorMemory,
} from "./actor-memories";

describe("actor memories service", () => {
  let db: Kysely<DB>;
  let actorId: string;

  beforeEach(async () => {
    const fresh = await createTestDb();
    db = fresh.db;
    await insertUsers(db, "owner", "Owner", { id: "user-owner", } as never,);
    await insertUsers(db, "other", "Other", { id: "user-other", } as never,);
    actorId = await insertActors(db, "Lyra", {
      id: "actor-lyra",
      owner_id: "user-owner",
      user_id: "user-owner",
    } as never,);
  },);

  afterEach(async () => {
    await db?.destroy();
  },);

  it("creates a memory with defaults and lists it", async () => {
    const created = await createActorMemory(db, actorId, "user-owner", "user", {
      content: "The innkeeper owes her a favor",
      importance: 3,
    },);

    expect(created.ok,).toBe(true,);
    if (!created.ok) { return; }
    expect(created.entity.actor_id,).toBe(actorId,);
    expect(created.entity.memory_type,).toBe("episodic",);
    expect(created.entity.importance,).toBe(3,);
    expect(created.entity.pinned,).toBe("unpinned",);

    const listed = await listActorMemories(db, actorId, "user-owner", "user",);
    expect(listed.ok,).toBe(true,);
    if (!listed.ok) { return; }
    expect(listed.total,).toBe(1,);
    expect(listed.items,).toHaveLength(1,);
    expect(listed.items[0]!.id,).toBe(created.entity.id,);
  });

  it("rejects create with empty content", async () => {
    const res = await createActorMemory(db, actorId, "user-owner", "user", {
      content: "",
    },);

    expect(res,).toEqual({ ok: false, code: "bad_request", message: "content is required", },);
  });

  it("paginates and filters by memory type", async () => {
    await createActorMemory(db, actorId, "user-owner", "user", {
      content: "a",
      memoryType: "episodic",
    },);

    await createActorMemory(db, actorId, "user-owner", "user", {
      content: "b",
      memoryType: "semantic",
    },);

    const page = await listActorMemories(db, actorId, "user-owner", "user", {
      page: 2,
      pageSize: 1,
    },);

    expect(page.ok,).toBe(true,);
    if (page.ok) {
      expect(page.total,).toBe(2,);
      expect(page.items,).toHaveLength(1,);
    }

    const semantic = await listActorMemories(db, actorId, "user-owner", "user", {
      memoryType: "semantic",
    },);

    expect(semantic.ok,).toBe(true,);
    if (semantic.ok) {
      expect(semantic.total,).toBe(1,);
      expect(semantic.items[0]!.content,).toBe("b",);
    }
  });

  it("updates a memory and bumps updated_at", async () => {
    const created = await createActorMemory(db, actorId, "user-owner", "user", {
      content: "before",
    },);

    if (!created.ok) { throw new Error("seed failed",); }

    const updated = await updateActorMemory(
      db,
      actorId,
      created.entity.id,
      "user-owner",
      "user",
      { content: "after", pinned: true, },
    );

    expect(updated.ok,).toBe(true,);
    if (!updated.ok) { return; }
    expect(updated.entity.content,).toBe("after",);
    expect(updated.entity.pinned,).toBe("pinned",);
    expect(updated.entity.updated_at,).not.toBeNull();
  });

  it("deletes a memory and reports not_found on repeat", async () => {
    const created = await createActorMemory(db, actorId, "user-owner", "user", {
      content: "fleeting",
    },);

    if (!created.ok) { throw new Error("seed failed",); }

    const deleted = await deleteActorMemory(
      db,
      actorId,
      created.entity.id,
      "user-owner",
      "user",
    );

    expect(deleted,).toEqual({ ok: true, id: created.entity.id, },);

    const again = await deleteActorMemory(
      db,
      actorId,
      created.entity.id,
      "user-owner",
      "user",
    );

    expect(again,).toEqual({ ok: false, code: "not_found", message: "Memory not found", },);
  });

  it("returns not_found when the actor does not exist", async () => {
    const created = await createActorMemory(db, "no-actor", "user-owner", "user", {
      content: "x",
    },);

    expect(created,).toEqual({ ok: false, code: "not_found", message: "Actor not found", },);

    const listed = await listActorMemories(db, "no-actor", "user-owner", "user",);
    expect(listed,).toEqual({ ok: false, code: "not_found", message: "Actor not found", },);
  });

  it("returns forbidden for a non-owner and allows admin", async () => {
    const created = await createActorMemory(db, actorId, "user-other", "user", {
      content: "x",
    },);

    expect(created,).toEqual({ ok: false, code: "forbidden", message: "Not allowed", },);

    const listed = await listActorMemories(db, actorId, "user-other", "user",);
    expect(listed,).toEqual({ ok: false, code: "forbidden", message: "Not allowed", },);

    const adminList = await listActorMemories(db, actorId, "user-other", "admin",);
    expect(adminList.ok,).toBe(true,);

    const adminCreate = await createActorMemory(db, actorId, "user-other", "admin", {
      content: "admin write",
    },);

    expect(adminCreate.ok,).toBe(true,);
  });

  it("rejects world-scope writes from non-admins but allows admins", async () => {
    const denied = await createActorMemory(db, actorId, "user-owner", "user", {
      content: "world memory",
      scope: "world",
    },);

    expect(denied,).toEqual(
      { ok: false, code: "forbidden", message: "World memories are admin-managed", },
    );

    const admin = await createActorMemory(db, actorId, "user-owner", "admin", {
      content: "world memory",
      scope: "world",
    },);

    expect(admin.ok,).toBe(true,);
  });

  it("keeps existing world memories admin-managed on update", async () => {
    const seeded = await insertActorMemories(db, actorId, "w", {
      id: "mem-world",
      scope: "world",
    },);

    const ownerEdit = await updateActorMemory(
      db,
      actorId,
      seeded,
      "user-owner",
      "user",
      { content: "hijack", },
    );

    expect(ownerEdit,).toEqual(
      { ok: false, code: "forbidden", message: "World memories are admin-managed", },
    );

    const demote = await updateActorMemory(
      db,
      actorId,
      seeded,
      "user-owner",
      "user",
      { scope: "character", },
    );

    expect(demote,).toEqual(
      { ok: false, code: "forbidden", message: "World memories are admin-managed", },
    );

    const adminEdit = await updateActorMemory(
      db,
      actorId,
      seeded,
      "user-owner",
      "admin",
      { content: "admin edit", },
    );

    expect(adminEdit.ok,).toBe(true,);
  });

  it("keeps existing world memories admin-managed on delete", async () => {
    const seeded = await insertActorMemories(db, actorId, "w", {
      id: "mem-world-del",
      scope: "world",
    },);

    const ownerDelete = await deleteActorMemory(
      db,
      actorId,
      seeded,
      "user-owner",
      "user",
    );

    expect(ownerDelete,).toEqual(
      { ok: false, code: "forbidden", message: "World memories are admin-managed", },
    );

    const stillThere = await db
      .selectFrom("actor_memories",)
      .select("id",)
      .where("id", "=", seeded,)
      .executeTakeFirst();

    expect(stillThere,).toBeDefined();

    const adminDelete = await deleteActorMemory(
      db,
      actorId,
      seeded,
      "user-owner",
      "admin",
    );

    expect(adminDelete,).toEqual({ ok: true, id: seeded, },);
  });
});
