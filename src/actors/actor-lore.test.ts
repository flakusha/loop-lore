import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../test-utils/insert-helpers";
import {
  createActorLoreEntry,
  deleteActorLoreEntry,
  listActorLoreEntries,
  updateActorLoreEntry,
} from "./actor-lore";

describe("actor lore entries service", () => {
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
    } as never,);
  },);

  afterEach(async () => {
    await db?.destroy();
  },);

  it("creates an entry with lorebook defaults and stores keys as JSON", async () => {
    const created = await createActorLoreEntry(db, actorId, "user-owner", "user", {
      content: "The Silver Order patrols the north road",
      name: "Silver Order",
      keys: ["silver order", "paladins",],
      priority: 200,
    },);

    expect(created.ok,).toBe(true,);
    if (!created.ok) { return; }
    expect(created.entity.enabled,).toBe("enabled",);
    expect(created.entity.position,).toBe("before_char",);
    expect(created.entity.insertion_order,).toBe(100,);
    expect(created.entity.priority,).toBe(200,);
    expect(JSON.parse(created.entity.keys,),).toEqual(["silver order", "paladins",],);

    const listed = await listActorLoreEntries(db, actorId, "user-owner", "user",);
    expect(listed.ok,).toBe(true,);
    if (listed.ok) {
      expect(listed.total,).toBe(1,);
      expect(listed.items[0]!.id,).toBe(created.entity.id,);
    }
  });

  it("rejects create with empty content", async () => {
    const res = await createActorLoreEntry(db, actorId, "user-owner", "user", {
      content: "",
    },);

    expect(res,).toEqual({ ok: false, code: "bad_request", message: "content is required", },);
  });

  it("orders by sort_order then insertion_order and filters by enabled", async () => {
    await createActorLoreEntry(db, actorId, "user-owner", "user", {
      content: "second",
      sortOrder: 2,
    },);

    await createActorLoreEntry(db, actorId, "user-owner", "user", {
      content: "first",
      sortOrder: 1,
    },);

    await createActorLoreEntry(db, actorId, "user-owner", "user", {
      content: "muted",
      enabled: "disabled",
    },);

    const listed = await listActorLoreEntries(db, actorId, "user-owner", "user",);
    expect(listed.ok,).toBe(true,);
    if (listed.ok) {
      expect(listed.items.map((e,) => e.content),).toEqual([
        "muted",
        "first",
        "second",
      ],);
    }

    const enabledOnly = await listActorLoreEntries(
      db,
      actorId,
      "user-owner",
      "user",
      { enabled: "enabled", },
    );

    expect(enabledOnly.ok,).toBe(true,);
    if (enabledOnly.ok) { expect(enabledOnly.total,).toBe(2,); }
  });

  it("updates keyword and toggle fields without clobbering others", async () => {
    const created = await createActorLoreEntry(db, actorId, "user-owner", "user", {
      content: "lore body",
      keys: ["old",],
    },);

    if (!created.ok) { throw new Error("seed failed",); }

    const updated = await updateActorLoreEntry(
      db,
      actorId,
      created.entity.id,
      "user-owner",
      "user",
      { keys: ["new", "keywords",], enabled: "disabled", },
    );

    expect(updated.ok,).toBe(true,);
    if (!updated.ok) { return; }
    expect(JSON.parse(updated.entity.keys,),).toEqual(["new", "keywords",],);
    expect(updated.entity.enabled,).toBe("disabled",);
    expect(updated.entity.content,).toBe("lore body",);
  });

  it("deletes an entry scoped to its actor", async () => {
    const created = await createActorLoreEntry(db, actorId, "user-owner", "user", {
      content: "temporary",
    },);

    if (!created.ok) { throw new Error("seed failed",); }

    const foreignActor = await insertActors(db, "Other", {
      id: "actor-other",
      owner_id: "user-owner",
    } as never,);

    const crossActor = await deleteActorLoreEntry(
      db,
      foreignActor,
      created.entity.id,
      "user-owner",
      "user",
    );

    expect(crossActor,).toEqual({ ok: false, code: "not_found", message: "Lore entry not found", },);

    const deleted = await deleteActorLoreEntry(
      db,
      actorId,
      created.entity.id,
      "user-owner",
      "user",
    );

    expect(deleted,).toEqual({ ok: true, id: created.entity.id, },);
  });

  it("distinguishes not_found from forbidden on the actor guard", async () => {
    const listed = await listActorLoreEntries(db, "no-actor", "user-owner", "user",);
    expect(listed,).toEqual({ ok: false, code: "not_found", message: "Actor not found", },);

    const created = await createActorLoreEntry(db, actorId, "user-other", "user", {
      content: "x",
    },);

    expect(created,).toEqual({ ok: false, code: "forbidden", message: "Not allowed", },);

    const admin = await createActorLoreEntry(db, actorId, "user-other", "admin", {
      content: "admin entry",
    },);

    expect(admin.ok,).toBe(true,);
  });
});
