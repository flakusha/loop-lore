import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../../test-utils/insert-helpers";
import { createChat, } from "../chats";
import { updateChat, } from "./update";

describe("updateChat gmConfig GM execution fields", () => {
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

  it("persists GM execution type / humanGM / escalationThreshold", async () => {
    const res = await updateChat(db, chatId, {
      gmConfig: {
        type: "hybrid",
        humanGM: { actorId: "user-gm", notifications: true, },
        escalationThreshold: 0.5,
      },
    },);
    expect(res,).toEqual({ ok: true, });
    const parsed = await gmConfigOf();
    expect(parsed?.type,).toBe("hybrid",);
    expect((parsed?.humanGM as { actorId: string }).actorId,).toBe("user-gm",);
    expect(parsed?.escalationThreshold,).toBe(0.5,);
  },);

  it("round-trips a human GM config", async () => {
    const res = await updateChat(db, chatId, {
      gmConfig: { type: "human", humanGM: { actorId: "user-gm", notifications: true, }, },
    },);
    expect(res,).toEqual({ ok: true, });
    const parsed = await gmConfigOf();
    expect(parsed?.type,).toBe("human",);
  },);

  it("persists a fully-merged gm_config blob (assistantRole + type + humanGM)", async () => {
    // The client merges existing keys (assistantRole/storyMode) with the new
    // GM-execution fields and sends the whole blob; updateChat persists it
    // verbatim (it replaces, not merges, the column).
    const res = await updateChat(db, chatId, {
      gmConfig: {
        assistantRole: "gm",
        storyMode: true,
        type: "human",
        humanGM: { actorId: "user-gm", notifications: true, },
      },
    },);
    expect(res,).toEqual({ ok: true, });
    const parsed = await gmConfigOf();
    expect(parsed?.assistantRole,).toBe("gm",);
    expect(parsed?.storyMode,).toBe(true,);
    expect(parsed?.type,).toBe("human",);
    expect((parsed?.humanGM as { actorId: string }).actorId,).toBe("user-gm",);
  },);

  it("persists GM llmConfig (multi-LLM model/provider/temperature/maxTokens)", async () => {
    const res = await updateChat(db, chatId, {
      gmConfig: {
        type: "llm",
        llmConfig: {
          model: "claude-3.5-sonnet",
          provider: "anthropic",
          systemPrompt: "",
          temperature: 0.8,
          maxTokens: 1500,
        },
      },
    },);
    expect(res,).toEqual({ ok: true, });
    const parsed = await gmConfigOf();
    expect(parsed?.type,).toBe("llm",);
    const llm = parsed?.llmConfig as {
      model: string; provider: string; systemPrompt: string; temperature: number; maxTokens: number;
    };
    expect(llm.model,).toBe("claude-3.5-sonnet",);
    expect(llm.provider,).toBe("anthropic",);
    expect(llm.temperature,).toBe(0.8,);
    expect(llm.maxTokens,).toBe(1500,);
  },);
},);
