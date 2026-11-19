// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import { loadConfig, } from "../../config/load";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { type CommandContext, type CommandHandler, type CommandResult, getCommand, } from "./registry";
import "./index";
import { listMessageActions, runRegenAction, } from "./regen";

const history = {
  chatId: "c1",
  messages: [
    { id: "1", role: "user", content: "hi", created_at: "t", },
    { id: "2", role: "assistant", content: "a somewhat wordy reply", created_at: "t", },
  ],
} as CommandContext;

describe("regen command", () => {
  it("is registered", () => {
    expect(getCommand("regen",),).toBeDefined();
  });

  it("declares the four guided actions", () => {
    expect(listMessageActions().map((a,) => a.id),).toEqual(["try-again", "add-details", "more-concise", "custom",],);
  });

  it("lists usage for unknown actions", async () => {
    const result = await runRegenAction([], history, {},);
    expect(result.systemMessage,).toContain("/regen",);
    expect(result.systemMessage,).toContain("try-again",);
  });

  it("reports when no assistant message exists", async () => {
    const result = await runRegenAction(["try-again",], { chatId: "c1", }, {},);
    expect(result.systemMessage,).toContain("No assistant message",);
  });

  it("routes try-again through the rewrite path", async () => {
    const result = await runRegenAction(["try-again",], history, {
      complete: async () => ({ content: "tighter reply", }),
    },);

    expect(result.systemMessage,).toContain("tighter reply",);
    expect(result.systemMessage,).not.toContain("LLM unavailable",);
  });

  it("routes more-concise through the concise style", async () => {
    let system = "";
    await runRegenAction(["more-concise",], history, {
      complete: async (req,) => {
        system = String(req.messages[0]?.content ?? "",);
        return { content: "short", };
      },
    },);

    expect(system,).toContain("concise style",);
  });

  it("routes add-details through local improve without a backend", async () => {
    const result = await runRegenAction(["add-details",], history, {},);
    expect(result.systemMessage,).toContain("Improved:",);
    expect(result.systemMessage,).toContain("LLM unavailable",);
  });

  it("routes custom with a free-text instruction through the rewrite path", async () => {
    let system = "";
    const result = await runRegenAction(
      ["custom", "redo,", "but", "keep", "her", "sarcastic",],
      history,
      {
        complete: async (req,) => {
          system = String(req.messages[0]?.content ?? "",);
          return { content: "a sarcastic reply", };
        },
      },
    );

    expect(system,).toContain("redo, but keep her sarcastic",);
    expect(result.systemMessage,).toContain("a sarcastic reply",);
    const payload = (result.actionPayload ?? {}) as Record<string, unknown>;
    expect(payload.instruction,).toBe("redo, but keep her sarcastic",);
    expect(payload.applied,).toBeUndefined();
  });

  it("preserves flag-like tokens in the free-text instruction", async () => {
    let system = "";
    await runRegenAction(["custom", "make", "it", "--snappy",], history, {
      complete: async (req,) => {
        system = String(req.messages[0]?.content ?? "",);
        return { content: "snappy", };
      },
    },);

    expect(system,).toContain("make it --snappy",);
  });

  it("rejects an empty custom instruction with usage text", async () => {
    for (const args of [["custom",], ["custom", "   ",],]) {
      const result = await runRegenAction(args, history, {},);
      expect(result.systemMessage,).toContain("/regen custom",);
      expect(result.systemMessage,).toContain("instruction",);
    }
  });

  it("rejects an over-long custom instruction", async () => {
    const result = await runRegenAction(["custom", "x".repeat(501,),], history, {},);
    expect(result.systemMessage,).toContain("too long",);
    expect(result.systemMessage,).toContain("500",);
  });

  it("does not preview a heuristic rewrite when custom generation fails", async () => {
    const result = await runRegenAction(["custom", "keep it terse",], history, {},);
    expect(result.systemMessage,).toContain("could not be applied",);
    expect(result.systemMessage,).not.toContain("LLM unavailable",);
    expect(result.actionPayload,).toBeUndefined();
  });
});

describe("registered /regen handler", () => {
  let testDb: Kysely<DB>;
  let testSqlite: Database;

  beforeAll(async () => {
    const env = await createTestDb();
    testDb = env.db;
    testSqlite = env.sqlite;
  },);

  afterAll(() => {
    testSqlite.close();
  },);

  function mustGet(): CommandHandler {
    const handler = getCommand("regen",);
    if (!handler) { throw new Error("command not registered: /regen",); }
    return handler;
  }

  function unresolvableConfig(): Config {
    return {
      ...loadConfig(),
      generation: {
        providers: {
          openaiCompatible: [],
          anthropic: undefined,
          ollamaNative: undefined,
          sd: undefined,
        },
        defaultProvider: "sm-cov-no-such-provider",
        defaultModels: {},
      },
    };
  }

  it("takes the local path without db/config", async () => {
    const result = await mustGet()(["add-details",], history,) as CommandResult;
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("Improved:",);
  });

  it("falls back to local runners when provider resolution fails", async () => {
    const fullCtx: CommandContext = { ...history, db: testDb, config: unresolvableConfig(), };
    const result = await mustGet()(["add-details",], fullCtx,) as CommandResult;
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("Improved:",);
  });
});

describe("regen decision gate wiring", () => {
  const GATE_ON = { assistant: { smartRegenGate: true, }, } as unknown as Config;

  async function payloadOf(args: string[], ctx: CommandContext,): Promise<Record<string, unknown>> {
    const result = await runRegenAction(args, ctx, {},);
    return (result.actionPayload ?? {}) as Record<string, unknown>;
  }

  it("gate off (default) keeps the usage menu for an unqualified regen", async () => {
    const result = await runRegenAction([], history, {},);
    expect(result.systemMessage,).toContain("/regen",);
  });

  it("gate on with a long target picks the condensing style", async () => {
    const longCtx: CommandContext = {
      chatId: "c1",
      messages: [{ id: "1", role: "assistant", content: "x".repeat(1300,), created_at: "t", },],
      config: GATE_ON,
    };

    expect(await payloadOf([], longCtx,),).toMatchObject({ style: "shorter", },);
  });

  it("gate on with a short target picks the expanding style", async () => {
    const shortCtx: CommandContext = {
      chatId: "c1",
      messages: [{ id: "1", role: "assistant", content: "short.", created_at: "t", },],
      config: GATE_ON,
    };

    expect(await payloadOf([], shortCtx,),).toMatchObject({ style: "longer", },);
  });

  it("gate on with a mid-sized target re-rolls plain (clear style)", async () => {
    const midCtx: CommandContext = {
      chatId: "c1",
      messages: [{ id: "1", role: "assistant", content: "m".repeat(400,), created_at: "t", },],
      config: GATE_ON,
    };

    expect(await payloadOf([], midCtx,),).toMatchObject({ style: "clear", },);
  });

  it("gate on with no target lands on the usage menu", async () => {
    const result = await runRegenAction([], { chatId: "c1", config: GATE_ON, }, {},);
    expect(result.systemMessage,).toContain("try-again",);
  });

  it("an explicit action still dispatches with the gate on", async () => {
    const conciseCtx: CommandContext = { ...history, config: GATE_ON, };
    let system = "";
    await runRegenAction(["more-concise",], conciseCtx, {
      complete: async (req,) => {
        system = String(req.messages[0]?.content ?? "",);
        return { content: "short", };
      },
    },);

    expect(system,).toContain("concise style",);
  });
});
