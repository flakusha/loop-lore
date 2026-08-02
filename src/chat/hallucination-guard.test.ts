import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertLocations, insertUsers, insertWorlds, } from "../test-utils/insert-helpers";
import { detectHallucinations, } from "./hallucination-guard";

describe("detectHallucinations", () => {
  let db: Kysely<DB>;

  beforeEach(async () => {
    db = (await createTestDb()).db;
  },);

  afterEach(async () => {
    await db?.destroy();
  },);

  it("does not flag short or entity-free text", async () => {
    const short = await detectHallucinations({ db, text: "hi", },);
    expect(short.detected,).toBe(false,);

    const plain = await detectHallucinations({ db, text: "the quiet forest path was empty at dawn.", },);
    expect(plain.detected,).toBe(false,);
  });

  it("does not flag text referencing a known actor", async () => {
    await insertActors(db, "Elena", { id: "actor-elena", } as never,);
    await insertActors(db, "Marcus", { id: "actor-marcus", } as never,);

    const result = await detectHallucinations({
      db,
      text: "Elena turned to face Marcus across the dim tavern.",
    },);
    expect(result.detected,).toBe(false,);
  });

  it("flags an invented character name", async () => {
    await insertActors(db, "Elena", { id: "actor-elena", } as never,);

    const result = await detectHallucinations({
      db,
      text: "elena confronted the stranger Zephyra in the courtyard.",
    },);
    expect(result.detected,).toBe(true,);
    expect(result.flags.some((f,) => f.entityName === "Zephyra"),).toBe(true,);
  });

  it("does not flag a known location within a world", async () => {
    // worlds.owner_id references users.id — seed an owner user first.
    await insertUsers(db, "owner", "Owner", { id: "owner-1", } as never,);
    await insertWorlds(db, "owner-1", "Aralyn",);
    const world = await db.selectFrom("worlds",).select("id",).where("name", "=", "Aralyn",).executeTakeFirst();
    await insertLocations(db, world!.id, "Silverwood",);

    const result = await detectHallucinations({
      db,
      text: "they arrived at Silverwood at noon.",
      worldId: world!.id,
    },);
    expect(result.detected,).toBe(false,);
  });

  it("flags an unknown location name even when a world id is provided", async () => {
    await insertUsers(db, "owner", "Owner", { id: "owner-1", } as never,);
    await insertWorlds(db, "owner-1", "Aralyn",);
    const world = await db.selectFrom("worlds",).select("id",).where("name", "=", "Aralyn",).executeTakeFirst();

    const result = await detectHallucinations({
      db,
      text: "they traveled to Xandria seeking shelter.",
      worldId: world!.id,
    },);
    expect(result.detected,).toBe(true,);
    expect(result.flags.some((f,) => f.entityName === "Xandria"),).toBe(true,);
  });

  it("returns a summary listing detected entities", async () => {
    await insertActors(db, "Elena", { id: "actor-elena", } as never,);
    const result = await detectHallucinations({
      db,
      text: "elena spoke with Quorin and Jaine.", // Quorin + Jaine unknown
    },);
    expect(result.detected,).toBe(true,);
    expect(result.summary,).toContain("Quorin",);
  });
});
