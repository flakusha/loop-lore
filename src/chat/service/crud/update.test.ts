import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import { MessageStatus, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertMessages, insertUsers, } from "../../../test-utils/insert-helpers";
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

  /** */
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

describe("updateChat online key-mechanic guard (presentation vs GM-execution)", () => {
  let db: Kysely<DB>;
  let chatId: string;

  beforeEach(async () => {
    const fresh = await createTestDb();
    db = fresh.db;
    await insertUsers(db, "online-creator", "Online Creator", { id: "user-on", } as never,);
    await insertActors(
      db,
      "Online Creator",
      { id: "user-on", user_id: "user-on", owner_id: "user-on", } as never,
    );
    chatId = await createChat(db, {
      name: "Online Story",
      type: "group",
      mode: "story",
      createdBy: "user-on",
      participantIds: ["user-on",],
    },);
    // Put the chat online with a confirmed message.
    await insertMessages(db, chatId, "user-on", "user", "hello", {
      status: MessageStatus.Confirmed,
    } as never,);
  },);

  afterEach(async () => {
    await db?.destroy();
  },);

  it("rejects GM-execution gmConfig sub-keys once online with key_mechanic_conflict", async () => {
    const res = await updateChat(db, chatId, {
      gmConfig: { type: "hybrid", assistantRole: "gm", },
    },);
    expect(res,).toMatchObject({ code: "key_mechanic_conflict", },);
    const details = (res as { details?: { fields: string[] } }).details;
    expect(details?.fields,).toContain("gmConfig.type",);
    expect(details?.fields,).toContain("gmConfig.assistantRole",);
  });

  it("allows presentation gmConfig sub-keys once online", async () => {
    const res = await updateChat(db, chatId, {
      gmConfig: { vnLayout: "below", vnSplitRatio: 55, vnImageScaling: "cover", },
    },);
    expect(res,).toEqual({ ok: true, },);
  });

  it("accepts presentation-only patch with vnLayout + visualNovel after first message", async () => {
    const res = await updateChat(db, chatId, {
      gmConfig: { visualNovel: true, vnLayout: "split", vnImageScaling: "contain", },
    },);
    expect(res,).toEqual({ ok: true, },);
    const row = await db.selectFrom("chats",).select("gm_config",).where("id", "=", chatId,)
      .executeTakeFirst();
    const parsed = row?.gm_config ? JSON.parse(row.gm_config,) : null;
    expect(parsed?.visualNovel,).toBe(true,);
    expect(parsed?.vnLayout,).toBe("split",);
    expect(parsed?.vnImageScaling,).toBe("contain",);
  });

  it("rejects llmConfig online with migrateEndpoint hint preserved", async () => {
    const res = await updateChat(db, chatId, {
      gmConfig: {
        llmConfig: {
          model: "gpt-4o",
          provider: "openai",
          systemPrompt: "",
          temperature: 0.7,
          maxTokens: 2000,
        },
      },
    },);
    expect(res,).toMatchObject({ code: "key_mechanic_conflict", },);
    const details = (res as { details?: { fields: string[]; migrateEndpoint: string } }).details;
    expect(details?.fields,).toContain("gmConfig.llmConfig",);
    expect(details?.migrateEndpoint,).toBe(`/api/chats/${chatId}/migrate`,);
  });

  it("still rejects top-level key-mechanic fields once online", async () => {
    const res = await updateChat(db, chatId, { mode: "direct", },);
    expect(res,).toMatchObject({ code: "key_mechanic_conflict", },);
  });

  it("rejects a mixed blob containing any GM-execution key", async () => {
    const res = await updateChat(db, chatId, {
      gmConfig: { vnLayout: "below", type: "llm", },
    },);
    expect(res,).toMatchObject({ code: "key_mechanic_conflict", },);
  });
});

describe("updateChat renderingOverride merge (gm_config string-spread regression)", () => {
  let db: Kysely<DB>;
  let chatId: string;

  beforeEach(async () => {
    const fresh = await createTestDb();
    db = fresh.db;
    await insertUsers(db, "ro-creator", "RO Creator", { id: "user-ro", } as never,);
    await insertActors(
      db,
      "RO Creator",
      { id: "user-ro", user_id: "user-ro", owner_id: "user-ro", } as never,
    );
    chatId = await createChat(db, {
      name: "RO Chat",
      type: "direct",
      mode: "story",
      createdBy: "user-ro",
      participantIds: ["user-ro",],
    },);
  },);

  afterEach(async () => {
    await db?.destroy();
  },);

  /** */
  async function gmConfigOf(): Promise<Record<string, unknown> | null> {
    const row = await db
      .selectFrom("chats",)
      .select("gm_config",)
      .where("id", "=", chatId,)
      .executeTakeFirst();
    return row?.gm_config ? JSON.parse(row.gm_config,) : null;
  }

  it("merges renderingOverride into an existing gm_config JSON string without string-spread garbage", async () => {
    // Seed a real JSON string — the exact shape the old code corrupted by
    // spreading a string into numeric-index keys.
    await db
      .updateTable("chats",)
      .set({ gm_config: JSON.stringify({ type: "llm", storyMode: true, },), },)
      .where("id", "=", chatId,)
      .execute();

    const res = await updateChat(db, chatId, { renderingOverride: "visual_novel", },);
    expect(res,).toEqual({ ok: true, },);

    const parsed = await gmConfigOf();
    expect(parsed,).toBeTruthy();
    // Pre-existing keys survive the merge.
    expect(parsed?.type,).toBe("llm",);
    expect(parsed?.storyMode,).toBe(true,);
    // New override is set.
    expect(parsed?.renderingOverride,).toBe("visual_novel",);
    // No string-spread numeric-index keys.
    const keys = Object.keys(parsed ?? {},);
    expect(keys.filter((k,) => /^\d+$/.test(k,)),).toEqual([],);
  });

  it("merges renderingOverride into a NULL gm_config without corruption", async () => {
    const res = await updateChat(db, chatId, { renderingOverride: "text", },);
    expect(res,).toEqual({ ok: true, },);
    const parsed = await gmConfigOf();
    expect(parsed?.renderingOverride,).toBe("text",);
    expect(Object.keys(parsed ?? {},).filter((k,) => /^\d+$/.test(k,)),).toEqual([],);
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

  /** */
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

describe("updateChat quickReplies (quick-reply button sets)", () => {
  let db: Kysely<DB>;
  let chatId: string;

  beforeEach(async () => {
    const fresh = await createTestDb();
    db = fresh.db;
    await insertUsers(db, "qr-creator", "QR Creator", { id: "user-qr", } as never,);
    await insertActors(
      db,
      "QR Creator",
      { id: "user-qr", user_id: "user-qr", owner_id: "user-qr", } as never,
    );
    chatId = await createChat(db, {
      name: "QR Chat",
      type: "direct",
      mode: "story",
      createdBy: "user-qr",
      participantIds: ["user-qr",],
    },);
  },);

  afterEach(async () => {
    await db?.destroy();
  },);

  /** */
  async function quickRepliesOf(): Promise<unknown> {
    const row = await db
      .selectFrom("chats",)
      .select("quick_replies",)
      .where("id", "=", chatId,)
      .executeTakeFirst();
    return row?.quick_replies ? JSON.parse(row.quick_replies,) : null;
  }

  it("persists a quick-reply button set", async () => {
    const res = await updateChat(db, chatId, {
      quickReplies: [
        { label: "Roll", command: "/roll 1d20", },
        { label: "Morning", command: "/time morning", trigger: "startup", },
      ],
    },);
    expect(res,).toEqual({ ok: true, },);
    expect(await quickRepliesOf(),).toEqual([
      { label: "Roll", command: "/roll 1d20", },
      { label: "Morning", command: "/time morning", trigger: "startup", },
    ],);
  });

  it("clears the button set with null", async () => {
    await updateChat(db, chatId, { quickReplies: [{ label: "X", command: "/x", },], },);
    const res = await updateChat(db, chatId, { quickReplies: null, },);
    expect(res,).toEqual({ ok: true, },);
    expect(await quickRepliesOf(),).toBeNull();
  });

  it("leaves the set untouched when the field is omitted", async () => {
    await updateChat(db, chatId, { quickReplies: [{ label: "Y", command: "/y", },], },);
    await updateChat(db, chatId, { name: "Renamed again", },);
    expect(await quickRepliesOf(),).toEqual([{ label: "Y", command: "/y", },],);
  });
});

describe("updateChat customInstructions (two-tier steering, story tier)", () => {
  let db: Kysely<DB>;
  let chatId: string;

  beforeEach(async () => {
    const fresh = await createTestDb();
    db = fresh.db;
    await insertUsers(db, "ci-creator", "CI Creator", { id: "user-ci", } as never,);
    await insertActors(
      db,
      "CI Creator",
      { id: "user-ci", user_id: "user-ci", owner_id: "user-ci", } as never,
    );
    chatId = await createChat(db, {
      name: "CI Chat",
      type: "direct",
      mode: "story",
      createdBy: "user-ci",
      participantIds: ["user-ci",],
    },);
  },);

  afterEach(async () => {
    await db?.destroy();
  },);

  /** */
  async function customInstructionsOf(): Promise<string | null> {
    const row = await db
      .selectFrom("chats",)
      .select("custom_instructions",)
      .where("id", "=", chatId,)
      .executeTakeFirst();
    return row?.custom_instructions ?? null;
  }

  it("persists the story tier and clears it with null", async () => {
    const res = await updateChat(db, chatId, { customInstructions: "second person only", },);
    expect(res,).toEqual({ ok: true, },);
    expect(await customInstructionsOf(),).toBe("second person only",);
    const cleared = await updateChat(db, chatId, { customInstructions: null, },);
    expect(cleared,).toEqual({ ok: true, },);
    expect(await customInstructionsOf(),).toBeNull();
  });

  it("empty string clears the column (same semantics as other text overrides)", async () => {
    await updateChat(db, chatId, { customInstructions: "keep tight", },);
    await updateChat(db, chatId, { customInstructions: "", },);
    expect(await customInstructionsOf(),).toBeNull();
  });

  it("leaves the column untouched when the field is omitted", async () => {
    await updateChat(db, chatId, { customInstructions: "steady", },);
    await updateChat(db, chatId, { name: "Renamed ci", },);
    expect(await customInstructionsOf(),).toBe("steady",);
  });
});
