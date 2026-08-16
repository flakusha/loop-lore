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
    return row?.gm_config ? JSON.parse(row.gm_config,) : null;
  }

  it("persists GM execution type / humanGM / escalationThreshold", async () => {
    const res = await updateChat(db, chatId, {
      gmConfig: {
        type: "hybrid",
        humanGM: { actorId: "user-gm", notifications: true, },
        escalationThreshold: 0.5,
      },
    },);
    expect(res,).toEqual({ ok: true, },);
    const parsed = await gmConfigOf();
    expect(parsed?.type,).toBe("hybrid",);
    expect((parsed?.humanGM as { actorId: string }).actorId,).toBe("user-gm",);
    expect(parsed?.escalationThreshold,).toBe(0.5,);
  });

  it("round-trips a human GM config", async () => {
    const res = await updateChat(db, chatId, {
      gmConfig: { type: "human", humanGM: { actorId: "user-gm", notifications: true, }, },
    },);
    expect(res,).toEqual({ ok: true, },);
    const parsed = await gmConfigOf();
    expect(parsed?.type,).toBe("human",);
  });

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
    expect(res,).toEqual({ ok: true, },);
    const parsed = await gmConfigOf();
    expect(parsed?.assistantRole,).toBe("gm",);
    expect(parsed?.storyMode,).toBe(true,);
    expect(parsed?.type,).toBe("human",);
    expect((parsed?.humanGM as { actorId: string }).actorId,).toBe("user-gm",);
  });

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
    expect(res,).toEqual({ ok: true, },);
    const parsed = await gmConfigOf();
    expect(parsed?.type,).toBe("llm",);
    const llm = parsed?.llmConfig as {
      model: string;
      provider: string;
      systemPrompt: string;
      temperature: number;
      maxTokens: number;
    };
    expect(llm.model,).toBe("claude-3.5-sonnet",);
    expect(llm.provider,).toBe("anthropic",);
    expect(llm.temperature,).toBeCloseTo(0.8,);
    expect(llm.maxTokens,).toBe(1500,);
  });

  it("persists per-actor model overrides (actorModels)", async () => {
    const res = await updateChat(db, chatId, {
      gmConfig: {
        type: "llm",
        actorModels: {
          "user-gm": { model: "claude-3.5-sonnet", provider: "anthropic", },
          "actor-2": { model: "gpt-4o", provider: "openai", },
        },
      },
    },);
    expect(res,).toEqual({ ok: true, },);
    const parsed = await gmConfigOf();
    expect(parsed?.type,).toBe("llm",);
    const am = parsed?.actorModels as Record<string, { model: string; provider: string }>;
    expect(am["user-gm"]!.model,).toBe("claude-3.5-sonnet",);
    expect(am["actor-2"]!.provider,).toBe("openai",);
  });
});

describe("updateChat promptOverride (per-chat prompt override)", () => {
  let db: Kysely<DB>;
  let chatId: string;

  beforeEach(async () => {
    const fresh = await createTestDb();
    db = fresh.db;
    await insertUsers(db, "override-creator", "Override Creator", { id: "user-ovr", } as never,);
    await insertActors(
      db,
      "Override Creator",
      { id: "user-ovr", user_id: "user-ovr", owner_id: "user-ovr", } as never,
    );
    chatId = await createChat(db, {
      name: "Override Chat",
      type: "direct",
      mode: "story",
      createdBy: "user-ovr",
      participantIds: ["user-ovr",],
    },);
  },);

  afterEach(async () => {
    await db?.destroy();
  },);

  async function promptOverrideOf(): Promise<string | null> {
    const row = await db
      .selectFrom("chats",)
      .select("prompt_override",)
      .where("id", "=", chatId,)
      .executeTakeFirst();
    return row?.prompt_override ?? null;
  }

  it("persists a prompt override", async () => {
    const res = await updateChat(db, chatId, {
      promptOverride: "You are the keeper of the Crimson Gate.",
    },);
    expect(res,).toEqual({ ok: true, },);
    expect(await promptOverrideOf(),).toBe("You are the keeper of the Crimson Gate.",);
  });

  it("clears a prompt override with null", async () => {
    await updateChat(db, chatId, { promptOverride: "temp override", },);
    const res = await updateChat(db, chatId, { promptOverride: null, },);
    expect(res,).toEqual({ ok: true, },);
    expect(await promptOverrideOf(),).toBeNull();
  });

  it("leaves the override untouched when the field is omitted", async () => {
    await updateChat(db, chatId, { promptOverride: "persistent override", },);
    await updateChat(db, chatId, { name: "Renamed", },);
    expect(await promptOverrideOf(),).toBe("persistent override",);
  });
});
