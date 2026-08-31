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
    stubBody = JSON.stringify({ name: "Aragorn", description: "Ranger of the North", },);

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
});
