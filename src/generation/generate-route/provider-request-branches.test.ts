// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Assembly-branch coverage for provider request building
 * (src/generation/generate-route/provider-request.ts).
 *
 * Covers the role-lookup best-effort paths (actor without a role,
 * unknown actor, broken database) and the request field mapping.
 * Uses an isolated in-memory database; the plugin-tool mapping
 * collapses to "all registered tools" which is empty in isolation.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { MockLLMProvider, } from "../../test-utils/mock-provider";
import type { ResolvedProvider, } from "../providers/registry";
import type { GenerationMessage, } from "../types";
import { buildProviderRequest, } from "./provider-request";
import type { GenerateRequest, } from "./types";

/** Minimal generation input for request assembly. */
function makeInput(overrides?: Partial<GenerateRequest>,): GenerateRequest {
  return {
    chatId: "chat-1",
    parentMessageId: "msg-1",
    actorId: "actor-1",
    idempotencyKey: "idemp-1",
    repetitionDetection: undefined,
    policyDetection: undefined,
    responseLimit: undefined,
    temperature: 0.7,
    maxTokens: 256,
    ...overrides,
  } as unknown as GenerateRequest;
}

/** Resolved provider stub carrying a fixed model and key. */
function makeResolved(): ResolvedProvider {
  return {
    provider: new MockLLMProvider(),
    resolvedProviderName: "sm-cov-prov",
    resolvedModel: "prov-model",
    resolvedApiKey: "prov-key",
  };
}

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

/** Insert an actor row, optionally with a plugin agent role. */
async function seedActor(agentRole: string | null,): Promise<string> {
  const id = randomUUID();
  await testDb.insertInto("actors",).values({
    id,
    actor_type: "character",
    display_name: "Prov Bot",
    agent_type: "ai",
    agent_role: agentRole,
    settings: "{}",
    format_version: 0,
    import_spec: "{}",
  },).execute();
  return id;
}

describe("buildProviderRequest", () => {
  test("maps model, key, params, messages and signal", async () => {
    const actorId = await seedActor(null,);
    const controller = new AbortController();
    const messages: GenerationMessage[] = [{ role: "user", content: "hi", },];
    const req = await buildProviderRequest({
      input: makeInput({ actorId, topP: 0.9, stop: ["</s>",], },),
      resolved: makeResolved(),
      messages,
      database: testDb,
      abortSignal: controller.signal,
      stream: true,
    },);
    expect(req.model,).toBe("prov-model",);
    expect(req.apiKey,).toBe("prov-key",);
    expect(req.messages,).toBe(messages,);
    expect(req.signal,).toBe(controller.signal,);
    expect(req.params.stream,).toBe(true,);
    expect(req.params.temperature,).toBe(0.7,);
    expect(req.params.maxTokens,).toBe(256,);
    expect(req.params.topP,).toBe(0.9,);
    expect(req.params.stop,).toEqual(["</s>",],);
  });

  test("exposes no plugin tools for an actor without an agent role", async () => {
    const actorId = await seedActor(null,);
    const req = await buildProviderRequest({
      input: makeInput({ actorId, },),
      resolved: makeResolved(),
      messages: [],
      database: testDb,
      abortSignal: new AbortController().signal,
      stream: false,
    },);
    // In isolation no plugin tools are registered, so the gated list is
    // empty and the request carries no tools array.
    expect(req.tools,).toBeUndefined();
  });

  test("falls back to all tools for an unknown agent role", async () => {
    const actorId = await seedActor("sm-cov-no-such-role",);
    const req = await buildProviderRequest({
      input: makeInput({ actorId, },),
      resolved: makeResolved(),
      messages: [],
      database: testDb,
      abortSignal: new AbortController().signal,
      stream: false,
    },);
    expect(req.model,).toBe("prov-model",);
    expect(req.tools,).toBeUndefined();
  });

  test("falls back to all tools when the actor lookup misses", async () => {
    const req = await buildProviderRequest({
      input: makeInput({ actorId: randomUUID(), },),
      resolved: makeResolved(),
      messages: [],
      database: testDb,
      abortSignal: new AbortController().signal,
      stream: false,
    },);
    expect(req.model,).toBe("prov-model",);
  });

  test("falls back to all tools when the database throws", async () => {
    const brokenDb = null as unknown as Kysely<DB>;
    const req = await buildProviderRequest({
      input: makeInput(),
      resolved: makeResolved(),
      messages: [],
      database: brokenDb,
      abortSignal: new AbortController().signal,
      stream: false,
    },);
    expect(req.model,).toBe("prov-model",);
    expect(req.params.stream,).toBe(false,);
  });
});
