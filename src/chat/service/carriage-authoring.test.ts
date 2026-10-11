// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage for `src/chat/service/carriage-authoring.ts`.
 *
 * The AUX call is driven end-to-end by registering a stub LLM provider and
 * pointing the `auxiliary` model-role override at it — no module mocking
 * (bun's `mock.module` is process-global; this keeps the file safe in a
 * shared test process). The stub's response body is mutated per test to
 * exercise the healCarriage approve-or-cancel gate: approved, oversize,
 * schema-violating (flat character list), unparseable, and AUX-unavailable
 * paths, plus the `authorCarriageIfEnabled` toggle hook.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import { CARRIAGE_AUTHORING_PROMPT, } from "../../aux-pipeline/prompts";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { registerProvider, unregisterProvider, } from "../../generation/providers/registry";
import type { GenerateRequest, GenerateResponse, LLMProvider, } from "../../generation/providers/types";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertCarriageRecords, insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { safeJsonParse, } from "../../utils/safe-json";
import { CARRIAGE_REPAIR_HINT, healCarriage, } from "../../utils/structured-output";
import { listCarriage, } from "./carriage";
import { authorCarriage, authorCarriageIfEnabled, } from "./carriage-authoring";

describe("CARRIAGE_AUTHORING_PROMPT", () => {
  it("pins the canonical [[characters]] shape and the flat-list ban", () => {
    // The prompt is the LLM contract for the carriage doc — the normative
    // array-of-tables form and the flat-list repair hint must both be named,
    // or the estimate drifts into the shape the gate exists to reject.
    expect(CARRIAGE_AUTHORING_PROMPT,).toContain("[[characters]]",);
    expect(CARRIAGE_AUTHORING_PROMPT,).toContain("name",);
    expect(CARRIAGE_AUTHORING_PROMPT,).toContain("status",);
    expect(CARRIAGE_AUTHORING_PROMPT.toLowerCase(),).toContain("toml",);
    expect(CARRIAGE_AUTHORING_PROMPT,).toContain("characters = [",);
  });
});

const VALID_TOML = [
  "episode = 4",
  'title = "The Sleeper\'s Warning"',
  "[[characters]]",
  'name = "K"',
  'status = "Inside the ruin"',
].join("\n",);

/** Oversize but otherwise canonical carriage doc (> 8 KiB). */
const OVERSIZE_TOML = `${VALID_TOML}\nsetting = "${"s".repeat(9000,)}"`;

/** Response body the stub provider returns for the current test. */
let stubContent = "";
/** Whether the stub provider should throw instead of answering. */
let stubThrows = false;
/** Last request seen by the stub provider (prompt assertions). */
let lastRequest: GenerateRequest | undefined;

registerProvider(
  "stub-carriage",
  {
    capabilities: {
      type: "openai-compatible",
      label: "stub carriage provider",
      text: true,
      image: false,
      embeddings: false,
      streaming: false,
      tools: false,
      thinking: false,
    },
    complete: async (req: GenerateRequest,): Promise<GenerateResponse> => {
      lastRequest = req;
      if (stubThrows) { throw new Error("stub provider unavailable",); }
      return {
        content: stubContent,
        finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, },
      };
    },
    stream: () => {
      throw new Error("streaming not supported by stub provider",);
    },
    healthCheck: () => Promise.resolve({ status: "ok", },),
    listModels: () => Promise.resolve([],),
  } satisfies LLMProvider,
);

// The provider registry is process-global: unregister so later suites see a pristine registry.
afterAll(() => {
  unregisterProvider("stub-carriage",);
},);

/** Minimal Config sufficient for resolveModelRole. */
function makeConfig(): Config {
  return {
    generation: {},
    templates: {},
  } as unknown as Config;
}

/** Reset stub provider state between tests. */
function resetStub(): void {
  stubContent = "";
  stubThrows = false;
  lastRequest = undefined;
}

describe("carriage authoring", () => {
  let db: Kysely<DB>;
  let sqlite: { close(): void };
  let ownerId: string;
  let chatId: string;

  beforeEach(async () => {
    createLogger({ level: "error", },);
    const ctx = await createTestDb();
    db = ctx.db;
    sqlite = ctx.sqlite;
    await db
      .insertInto("model_role_overrides",)
      .values({ role: "auxiliary", provider: "stub-carriage", model: "stub-model", },)
      .execute();

    ownerId = crypto.randomUUID();
    await insertUsers(db, "carriage-owner", "Carriage Owner", { id: ownerId, } as never,);
    chatId = crypto.randomUUID();
    await insertChats(db, "Carriage Authoring Chat", ownerId, { id: chatId, } as never,);

    resetStub();
  },);

  afterEach(() => {
    sqlite.close();
  },);

  it("approves a canonical TOML estimate and persists a carriage record that round-trips", async () => {
    stubContent = VALID_TOML;

    const result = await authorCarriage(db, {
      chatId,
      aiContent: "K slips inside the ruin.",
      userContent: "K goes in.",
      config: makeConfig(),
    },);

    expect(result.status,).toBe("approved",);
    if (result.status !== "approved") { return; }
    expect(result.record.chatId,).toBe(chatId,);
    expect(result.record.scope,).toBe("carriage",);

    // payload { toml } JSON round-trips back through the healing gate.
    const payload = safeJsonParse<{ toml: string }>(result.record.payload,);
    expect(payload.ok,).toBe(true,);
    if (payload.ok) {
      expect(payload.value.toml,).toBe(VALID_TOML,);
      expect(healCarriage(payload.value.toml,).ok,).toBe(true,);
    }

    expect(await listCarriage(db, chatId, { limit: 10, scope: "carriage", },),).toHaveLength(1,);

    // Prompt shape: canonical [[characters]] system prompt + latest turn.
    expect(lastRequest?.messages,).toHaveLength(2,);
    expect(lastRequest?.messages[0]?.role,).toBe("system",);
    expect(lastRequest?.messages[0]?.content,).toContain("[[characters]]",);
    expect(lastRequest?.messages[1]?.content,).toContain("Latest turn:",);
    expect(lastRequest?.messages[1]?.content,).toContain("User: K goes in.",);
    expect(lastRequest?.messages[1]?.content,).toContain("Assistant: K slips inside the ruin.",);
  });

  it("threads the previous carriage TOML into the estimate prompt", async () => {
    stubContent = VALID_TOML;

    await authorCarriage(db, {
      chatId,
      aiContent: "ai",
      previousToml: "episode = 3",
      config: makeConfig(),
    },);

    expect(lastRequest?.messages[1]?.content,).toContain("Current carriage block to update:\nepisode = 3\n\n",);
  });

  it("cancels an oversize estimate and writes no record", async () => {
    stubContent = OVERSIZE_TOML;

    const result = await authorCarriage(db, {
      chatId,
      aiContent: "ai",
      config: makeConfig(),
    },);

    expect(result,).toEqual({ status: "cancelled", reason: "oversize", hint: expect.any(String,), },);
    expect(await listCarriage(db, chatId, { scope: "carriage", },),).toHaveLength(0,);
  });

  it("cancels a flat characters list with the repair hint and writes no record", async () => {
    stubContent = 'characters = ["K", "G"]\n';

    const result = await authorCarriage(db, {
      chatId,
      aiContent: "ai",
      config: makeConfig(),
    },);

    expect(result,).toEqual({
      status: "cancelled",
      reason: "schema_violation",
      hint: CARRIAGE_REPAIR_HINT,
    },);

    expect(await listCarriage(db, chatId, { scope: "carriage", },),).toHaveLength(0,);
  });

  it("cancels an unparseable estimate and writes no record", async () => {
    stubContent = "[[[!!!";

    const result = await authorCarriage(db, {
      chatId,
      aiContent: "ai",
      config: makeConfig(),
    },);

    expect(result.status,).toBe("cancelled",);
    if (result.status === "cancelled") { expect(result.reason,).toBe("unparseable",); }
    expect(await listCarriage(db, chatId, { scope: "carriage", },),).toHaveLength(0,);
  });

  it("reports unavailable when the AUX call fails and writes no record", async () => {
    stubThrows = true;

    const result = await authorCarriage(db, {
      chatId,
      aiContent: "ai",
      config: makeConfig(),
    },);

    expect(result,).toEqual({ status: "unavailable", },);
    expect(await listCarriage(db, chatId, { scope: "carriage", },),).toHaveLength(0,);
  });

  describe("authorCarriageIfEnabled", () => {
    it("no-ops silently when the toggle is off", async () => {
      const offChatId = crypto.randomUUID();
      await insertChats(db, "Off Chat", ownerId, {
        id: offChatId,
        gm_config: JSON.stringify({ carriageEnabled: false, },),
      } as never,);

      stubContent = VALID_TOML;

      await authorCarriageIfEnabled(db, {
        chatId: offChatId,
        aiContent: "ai",
        config: makeConfig(),
      },);

      expect(lastRequest,).toBeUndefined();
      expect(await listCarriage(db, offChatId, { scope: "carriage", },),).toHaveLength(0,);
    });

    it("no-ops when the chat or its gm_config is missing or malformed", async () => {
      stubContent = VALID_TOML;

      // Unknown chat id.
      await authorCarriageIfEnabled(db, {
        chatId: crypto.randomUUID(),
        aiContent: "ai",
        config: makeConfig(),
      },);

      // Chat without any gm_config blob.
      await authorCarriageIfEnabled(db, {
        chatId,
        aiContent: "ai",
        config: makeConfig(),
      },);

      // Chat with a non-JSON gm_config blob.
      const brokenId = crypto.randomUUID();
      await insertChats(db, "Broken Chat", ownerId, {
        id: brokenId,
        gm_config: "{not json",
      } as never,);

      await authorCarriageIfEnabled(db, {
        chatId: brokenId,
        aiContent: "ai",
        config: makeConfig(),
      },);

      expect(lastRequest,).toBeUndefined();
      expect(await listCarriage(db, brokenId, { scope: "carriage", },),).toHaveLength(0,);
    });

    it("re-authors from the stored TOML when the toggle is on", async () => {
      const onChatId = crypto.randomUUID();
      await insertChats(db, "On Chat", ownerId, {
        id: onChatId,
        gm_config: JSON.stringify({ carriageEnabled: true, },),
      } as never,);

      await insertCarriageRecords(
        db,
        onChatId,
        "carriage",
        JSON.stringify({ toml: "episode = 3", },),
        new Date().toISOString(),
      );

      stubContent = VALID_TOML;

      await authorCarriageIfEnabled(db, {
        chatId: onChatId,
        aiContent: "The party moves on.",
        config: makeConfig(),
      },);

      // The stored TOML fed the estimate prompt; the approved doc was stored.
      expect(lastRequest?.messages[1]?.content,).toContain("Current carriage block to update:\nepisode = 3",);
      const records = await listCarriage(db, onChatId, { limit: 10, scope: "carriage", },);
      expect(records,).toHaveLength(2,);
      const tomls = records
        .map((r,) => safeJsonParse<{ toml: string }>(r.payload,))
        .filter((p,) => p.ok)
        .map((p,) => p.value.toml);

      expect(tomls,).toContain(VALID_TOML,);
      expect(tomls,).toContain("episode = 3",);
    });
  });
});
