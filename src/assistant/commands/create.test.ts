// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeEach, describe, expect, it, } from "bun:test";
import type { Config, } from "../../config/schema";
import type { GenerateRequest, } from "../../generation/providers/types";
import { createTestDb, } from "../../test-utils/create-test-db";
import { runCreateGeneration, } from "./create";
import type { CommandResult, } from "./registry";

/** Mocked LLM response body, mutated per test. */
let stubBody = "{}";

/** Captured request so tests can assert the model is threaded through. */
let lastReq: GenerateRequest | undefined;

/**
 * Stub completion fn injected into runCreateGeneration.
 * @param req
 */
const stubComplete = async (req: GenerateRequest,): Promise<{ content: string }> => {
  lastReq = req;
  return { content: stubBody, };
};

/** Minimal Config stub sufficient for resolveEntityGenerationPrompt + byoKey. */
function makeConfig(): Config {
  return {
    generation: {
      defaultProvider: "mock",
      defaultModels: {},
      providers: { openaiCompatible: [], },
    },
    byoKey: { enabled: false, encryptionKey: null, },
  } as unknown as Config;
}

describe("/create command — preview flow", () => {
  beforeEach(() => {
    stubBody = "{}";
    lastReq = undefined;
  },);

  it("returns create-entity-preview with validated draft and threads the model, performs no insert", async () => {
    const { db, } = await createTestDb();
    stubBody = JSON.stringify({
      name: "Aragorn",
      description: "Ranger of the North",
      personality: "Stern.",
      appearance: "Tall ranger.",
    },);

    const result: CommandResult = await runCreateGeneration(
      ["char", "a doomed king",],
      {
        chatId: "c1",
        activeChat: { id: "c1", worldId: undefined, },
        db,
        config: makeConfig(),
        userId: "u1",
      },
      stubComplete,
      "stub-model",
    );

    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("create-entity-preview",);
    const payload = result.actionPayload as {
      kind: string;
      data: { name: string; description: string };
    };
    expect(payload.kind,).toBe("character",);
    expect(payload.data.name,).toBe("Aragorn",);
    // Model must reach the LLM request (regression guard for empty-model bug).
    expect(lastReq?.model,).toBe("stub-model",);
  });

  it("returns create-entity-preview with structured lore entries in preview", async () => {
    const { db, } = await createTestDb();
    stubBody = JSON.stringify({
      name: "The Ancient One",
      description: "An old mage",
      personality: "Wise.",
      appearance: "Ancient robes.",
      lore: [
        {
          name: "First Knowledge",
          content: "The first spell was fire.",
          keys: ["fire", "spell",],
          subject: { kind: "race", race: "human", },
          constant: false,
          selective: true,
          position: "before_char",
        },
      ],
    },);

    const result: CommandResult = await runCreateGeneration(
      ["char", "an ancient mage",],
      {
        chatId: "c1",
        activeChat: { id: "c1", worldId: undefined, },
        db,
        config: makeConfig(),
        userId: "u1",
      },
      stubComplete,
      "stub-model",
    );

    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("create-entity-preview",);
    const payload = result.actionPayload as {
      kind: string;
      data: { name: string; lore: unknown[] };
    };
    expect(payload.kind,).toBe("character",);
    expect(payload.data.name,).toBe("The Ancient One",);
    expect(Array.isArray(payload.data.lore,),).toBe(true,);
    const loreArr = payload.data.lore as Array<{ name: string }>;
    expect(loreArr[0]!.name,).toBe("First Knowledge",);
    expect(result.systemMessage,).toContain("Lore entries:",);
  });
  it("rejects schema-invalid generation without inserting", async () => {
    const { db, } = await createTestDb();
    stubBody = JSON.stringify({ name: "NoDesc", },);

    const result = await runCreateGeneration(
      ["char", "missing description",],
      {
        chatId: "c1",
        db,
        config: makeConfig(),
        userId: "u1",
      },
      stubComplete,
      "stub-model",
    );

    expect(result.action,).toBeUndefined();
    expect(result.systemMessage,).toContain("rejected",);
    const actors = await db.selectFrom("actors",).selectAll().execute();
    expect(actors,).toHaveLength(0,);
  });

  it("returns usage hint for an unknown subcommand token", async () => {
    const { db, } = await createTestDb();
    const result = await runCreateGeneration(
      ["bogus", "x",],
      {
        chatId: "c1",
        db,
        config: makeConfig(),
        userId: "u1",
      },
      stubComplete,
      "stub-model",
    );
    expect(result.action,).toBeUndefined();
    expect(result.systemMessage,).toContain("Usage",);
  });
  it("never leaks raw LLM output into chat on parse failure", async () => {
    const { db, } = await createTestDb();
    stubBody = "SECRET-MARKER not json {{{";

    const result = await runCreateGeneration(
      ["char", "a doomed king",],
      {
        chatId: "c1",
        db,
        config: makeConfig(),
        userId: "u1",
      },
      stubComplete,
      "stub-model",
    );

    expect(result.action,).toBeUndefined();
    expect(result.systemMessage ?? "",).not.toContain("SECRET-MARKER",);
    expect(result.systemMessage ?? "",).toContain("Nothing was saved",);
    const actors = await db.selectFrom("actors",).selectAll().execute();
    expect(actors,).toHaveLength(0,);
  });

  it("never leaks provider error text into chat on generation failure", async () => {
    const { db, } = await createTestDb();
    const failingComplete = async (): Promise<{ content: string }> => {
      throw new Error("Bearer sk-live-SECRET upstream 500",);
    };

    const result = await runCreateGeneration(
      ["loc", "a dark tower",],
      {
        chatId: "c1",
        db,
        config: makeConfig(),
        userId: "u1",
      },
      failingComplete,
      "stub-model",
    );

    expect(result.action,).toBeUndefined();
    expect(result.systemMessage ?? "",).not.toContain("sk-live-SECRET",);
    expect(result.systemMessage ?? "",).not.toContain("upstream",);
    expect(result.systemMessage ?? "",).toContain("Nothing was saved",);
    const actors = await db.selectFrom("actors",).selectAll().execute();
    expect(actors,).toHaveLength(0,);
  });
  it("rejects lore entries with unknown subject kind (B2)", async () => {
    const { db, } = await createTestDb();
    stubBody = JSON.stringify({
      name: "Dark Mage",
      description: "A sorcerer",
      lore: [
        {
          name: "Forbidden Knowledge",
          content: "Learned from demons.",
          subject: { kind: "bogus", },
        },
      ],
    },);

    const result = await runCreateGeneration(
      ["char", "a dark mage",],
      {
        chatId: "c1",
        db,
        config: makeConfig(),
        userId: "u1",
      },
      stubComplete,
      "stub-model",
    );

    expect(result.action,).toBeUndefined();
    expect(result.systemMessage,).toContain("rejected",);
    const actors = await db.selectFrom("actors",).selectAll().execute();
    expect(actors,).toHaveLength(0,);
  });

  it("systemMessage includes lore schema and example for each kind (B1)", async () => {
    const { db, } = await createTestDb();
    stubBody = JSON.stringify({ name: "Test", description: "desc", },);

    for (const cmd of ["char", "loc", "world", "item",] as const) {
      stubBody = JSON.stringify({ name: "Test", description: "desc", },);
      const _result = await runCreateGeneration(
        [cmd, "a test entity",],
        {
          chatId: "c1",
          db,
          config: makeConfig(),
          userId: "u1",
        },
        stubComplete,
        "stub-model",
      );
      expect(_result.handled,).toBe(true,);
      expect(lastReq?.messages[1]?.content,).toContain("lore",);
      expect(lastReq?.messages[1]?.content,).toContain("Example:",);
    }
  });
});
