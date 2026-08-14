import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../../test-utils/insert-helpers";
import { createChat, } from "../chats";
import { updateGmGuidance, } from "./gm-guidance";

describe("updateGmGuidance", () => {
  let db: Kysely<DB>;
  let chatId: string;

  beforeEach(async () => {
    const fresh = await createTestDb();
    db = fresh.db;
    await insertUsers(db, "gm-creator", "GM Creator", { id: "user-gm", } as never,);
    await insertActors(
      db,
      "GM Creator",
      { id: "user-gm", user_id: "user-gm", owner_id: "user-gm", } as never,
    );
    chatId = await createChat(db, {
      name: "GM Story",
      type: "group",
      mode: "story",
      createdBy: "user-gm",
      participantIds: ["user-gm",],
    },);
  },);

  afterEach(async () => {
    await db?.destroy();
  },);

  async function gmConfigOf(): Promise<Record<string, unknown> | null> {
    const row = await db
      .selectFrom("chats",)
      .select("gm_config",)
      .where("id", "=", chatId,)
      .executeTakeFirst();
    return row?.gm_config ? JSON.parse(row.gm_config as string) : null;
  }

  it("merges guidance into gm_config", async () => {
    const res = await updateGmGuidance(db, chatId, {
      storyMode: true,
      gmGuidance: { constraints: ["stay in character"], turnPriority: { "a1": "high", }, },
    },);
    expect(res,).toEqual({ ok: true, });
    const parsed = await gmConfigOf();
    expect(parsed?.storyMode,).toBe(true,);
    expect((parsed?.gmGuidance as { constraints: string[] }).constraints,).toEqual(["stay in character"],);
  },);

  it("returns not_found for a missing chat", async () => {
    const res = await updateGmGuidance(db, "does-not-exist", { storyMode: true },);
    expect(res,).toEqual({ code: "not_found", message: "Chat not found", },);
  },);

  it("merges over existing gm_config without clobbering sibling keys", async () => {
    await updateGmGuidance(db, chatId, {
      gmGuidance: { constraints: ["a"], turnPriority: {}, },
    },);
    await updateGmGuidance(db, chatId, { storyMode: true },);
    const parsed = await gmConfigOf();
    expect((parsed?.gmGuidance as { constraints: string[] }).constraints,).toEqual(["a"],);
    expect(parsed?.storyMode,).toBe(true,);
  },);
},);
