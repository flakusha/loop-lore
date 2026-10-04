// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Stream-flag resolution chain for src/generation/generate-route/resolve-options.ts.
 *
 * The `resolvedStream === undefined` branch is the one part of the extracted
 * block that handleGenerate's integration tests never reach — every request
 * there pins `stream` explicitly, so that chain rests entirely on the moved
 * code being correct. These cases pin its precedence order directly,
 * including the falsy-but-not-null `streaming = 0` row, which must NOT be
 * overridden by a true config default.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { MockLLMProvider, } from "../../test-utils/mock-provider";
import type { ResolvedProvider, } from "../providers/registry";
import type { ProviderCapabilities, } from "../providers/types";
import { resolveOptions, } from "./resolve-options";
import type { GenerateRequest, } from "./types";

let testDb: Kysely<DB>;
let testSqlite: Database;

/**
 * Mock provider with a per-instance streaming capability. The base class
 * shares one MOCK_CAPABILITIES singleton across every test in the run, so
 * the capability is copied rather than assigned onto the shared object.
 */
class StreamingToggleProvider extends MockLLMProvider {
  override readonly capabilities: ProviderCapabilities;

  constructor(streaming: boolean,) {
    super();
    // Re-declared rather than spread off the parent: TS2855 forbids reading
    // a parent class field through `super`.
    this.capabilities = {
      type: "openai-compatible",
      label: "Stream Toggle Mock",
      text: true,
      image: false,
      embeddings: false,
      streaming,
      tools: false,
      thinking: false,
    };
  }
}

/** Insert a chat row carrying the `streaming` tri-state under test. */
async function insertStreamingChat(streaming: number | null,): Promise<string> {
  return insertChats(testDb, "Streaming chat", USER_ID, { streaming, },);
}

function makeInput(overrides?: Partial<GenerateRequest>,): GenerateRequest {
  // The route validates the request before this point; only the fields
  // resolveOptions reads are meaningful here.
  return {
    chatId: "chat-1",
    parentMessageId: "msg-1",
    actorId: "actor-1",
    idempotencyKey: `idemp-${crypto.randomUUID()}`,
    stream: undefined,
    temperature: 0.5,
    maxTokens: 256,
    ...overrides,
  } as unknown as GenerateRequest;
}

/** Config with only the streaming default pinned — the sole field read. */
function makeCfg(defaultStream: boolean | null,): Config {
  return { generation: { defaultStream, }, } as unknown as Config;
}

function makeResolved(streamingCapable: boolean,): ResolvedProvider {
  return {
    provider: new StreamingToggleProvider(streamingCapable,),
    resolvedProviderName: "stub-prov",
    resolvedModel: "stub-model",
    resolvedApiKey: "stub-key",
  };
}

function resolve(input: GenerateRequest, cfg: Config, capable: boolean,) {
  return resolveOptions({
    input,
    database: testDb,
    cfg,
    resolved: makeResolved(capable,),
    messages: [],
    systemPrompt: undefined,
  },);
}

/** chats.created_by is FK-checked against users in the test schema. */
const USER_ID = "resolve-options-user";

beforeAll(async () => {
  const env = await createTestDb();
  testDb = env.db;
  testSqlite = env.sqlite;
  await insertUsers(testDb, "resolve-options-user", "Resolve Options", { id: USER_ID, },);
},);

afterAll(() => {
  testSqlite.close();
},);

describe("resolveOptions stream resolution chain", () => {
  test("chat streaming=1 wins over a false config default and a capable provider", async () => {
    const chatId = await insertStreamingChat(1,);
    const { resolvedStream, } = await resolve(makeInput({ chatId, },), makeCfg(false,), true,);
    expect(resolvedStream,).toBe(true,);
  });

  test("chat streaming=0 wins over a true config default and a capable provider", async () => {
    const chatId = await insertStreamingChat(0,);
    const { resolvedStream, } = await resolve(makeInput({ chatId, },), makeCfg(true,), true,);
    expect(resolvedStream,).toBe(false,);
  });

  test("chat streaming=null defers to a true config default", async () => {
    const chatId = await insertStreamingChat(null,);
    const { resolvedStream, } = await resolve(makeInput({ chatId, },), makeCfg(true,), false,);
    expect(resolvedStream,).toBe(true,);
  });

  test("chat streaming=null plus config default false stays false even when the provider can stream", async () => {
    const chatId = await insertStreamingChat(null,);
    const { resolvedStream, } = await resolve(makeInput({ chatId, },), makeCfg(false,), true,);
    expect(resolvedStream,).toBe(false,);
  });

  test("chat streaming=null plus config default null falls through to provider capability", async () => {
    const capableChat = await insertStreamingChat(null,);
    const incapableChat = await insertStreamingChat(null,);
    expect((await resolve(makeInput({ chatId: capableChat, },), makeCfg(null,), true,)).resolvedStream,).toBe(true,);
    expect((await resolve(makeInput({ chatId: incapableChat, },), makeCfg(null,), false,)).resolvedStream,).toBe(
      false,
    );
  });

  test("explicit request stream wins over every fallback", async () => {
    const chatId = await insertStreamingChat(1,);
    const { resolvedStream, } = await resolve(makeInput({ chatId, stream: false, },), makeCfg(true,), true,);
    expect(resolvedStream,).toBe(false,);
  });

  test("targetMessageId forces non-streaming past the whole chain", async () => {
    const chatId = await insertStreamingChat(1,);
    const { resolvedStream, } = await resolve(
      makeInput({ chatId, targetMessageId: "msg-target", },),
      makeCfg(true,),
      true,
    );
    expect(resolvedStream,).toBe(false,);
  });

  test("an explicit chat id with no row falls through to the config default", async () => {
    const { resolvedStream, } = await resolve(makeInput({ chatId: "does-not-exist", },), makeCfg(true,), false,);
    expect(resolvedStream,).toBe(true,);
  });
});
