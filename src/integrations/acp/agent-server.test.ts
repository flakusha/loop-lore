// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * agent-server.test.ts — the inbound ACP studio agent (§3.3) against the
 * REAL facade registry + chat pipeline over an in-memory database.
 *
 * Covers: case-insensitive method dispatch (the Studio parity), the
 * initialize/session-new/prompt happy path with `session/update`
 * agent_message_chunk delivery, the facade tier refusal surfacing as a
 * JSON-RPC error, unknown-session and unknown-method errors, and the
 * unparseable-line contract.
 *
 * Resource contract (parallel-safe): one :memory: SQLite per file, registry
 * reset per build, no ports/env; the write sink is an in-memory array.
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { principalKind, } from "../../middleware/principal-kind";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChatParticipants, insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { getFacadeRegistry, resetFacadeRegistry, } from "../loop-lore-facade/instance";
import type { FacadeContext, } from "../loop-lore-facade/types";
import { ACP_ERRORS, ACP_PROTOCOL_VERSION, createAcpAgentHandler, extractReplyText, } from "./agent-server";

const USER = "acp-agent-user";
const CHAT = "acp-agent-chat";

let testDb: TestDb;
let db: Kysely<DB>;
let config: Config;

/** Everything the server emitted, as parsed JSON-RPC messages. */
interface OutMessage {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: unknown };
  params?: { sessionId?: string; update?: { sessionUpdate?: string; content?: { text?: string } } };
}

/** One agent connection: handler + captured output. */
function makeAgent(
  ctx: FacadeContext,
  elicit?: (request: unknown,) => Promise<{ action: "accept" | "decline" | "cancel" }>,
) {
  const out: OutMessage[] = [];
  const handler = createAcpAgentHandler({
    registry: getFacadeRegistry({ database: db, config, },),
    ctx,
    ...(elicit ? { elicit, } : {}),
    write: (message,) => {
      out.push(message as OutMessage,);
    },
  },);

  return { out, handler, };
}

/** The inbound principal context, hand-built (the seam under test lives in
 * principal.ts; here we exercise the AGENT protocol itself). */
function ctxFor(scope: "read" | "chat-write", requestId: string, cfg: Config = config,): FacadeContext {
  return {
    database: db,
    config: cfg,
    requestId,
    principal: {
      kind: principalKind("external-agent",),
      userId: USER,
      userRole: null,
      credentialId: null,
      credentialName: "inbound-acp-stdio",
      credentialScope: scope,
    },
  };
}

beforeAll(async () => {
  createLogger({ level: "error", },);
  testDb = await createTestDb();
  db = testDb.db;
  config = createConfigSchema().defaults as unknown as Config;

  await insertUsers(db, USER, "ACP Operator", { id: USER, },);
  await insertActors(db, "ACP Operator", { id: USER, user_id: USER, owner_id: USER, },);
  await insertChats(db, "acp-agent", USER, { id: CHAT, },);
  await insertChatParticipants(db, CHAT, USER, { role_in_chat: "owner", },);
},);

afterAll(async () => {
  resetFacadeRegistry();
  await destroyTestDb(testDb,);
},);

describe("inbound ACP agent server", () => {
  test("initialize answers protocolVersion 1 regardless of method casing", async () => {
    resetFacadeRegistry();
    const { out, handler, } = makeAgent(ctxFor("read", "acp-init",),);

    await handler(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "INITIALIZE", params: {}, },),);
    await handler(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "Initialize", params: {}, },),);

    expect(out,).toHaveLength(2,);
    for (const [i, message,] of out.entries()) {
      expect(message.result?.protocolVersion,).toBe(ACP_PROTOCOL_VERSION,);
      expect((message.result?.agentInfo as Record<string, unknown>).name,).toBe("loop-lore",);
      expect(message.id,).toBe(i + 1,);
    }
  });

  test("session/new + session/prompt delivers the reply as agent_message_chunk then end_turn", async () => {
    resetFacadeRegistry();
    const { out, handler, } = makeAgent(ctxFor("chat-write", "acp-prompt",),);

    await handler(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "session/new", params: { loopLoreChatId: CHAT, }, },),
    );

    const sessionNew = out[0];
    const sessionId = sessionNew?.result?.sessionId as string;
    expect(sessionId,).toMatch(/^acp-/,);

    out.length = 0;
    await handler(JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "Session/Prompt",
      params: { sessionId, prompt: [{ type: "text", text: "hello from the studio", },], },
    },),);

    expect(out,).toHaveLength(2,);
    expect(out[0]?.method,).toBe("session/update",);
    expect(out[0]?.params?.sessionId,).toBe(sessionId,);
    expect(out[0]?.params?.update?.sessionUpdate,).toBe("agent_message_chunk",);
    expect(typeof out[0]?.params?.update?.content?.text,).toBe("string",);
    expect(out[1]?.result?.stopReason,).toBe("end_turn",);
    expect(out[1]?.id,).toBe(2,);

    // The message really went through the chat pipeline.
    const rows = await db.selectFrom("messages",).selectAll().where("content", "=", "hello from the studio",).execute();
    expect(rows.length,).toBe(1,);
  });

  test("a read-tier principal's prompt is a JSON-RPC error, never a fabricated success", async () => {
    resetFacadeRegistry();
    const { out, handler, } = makeAgent(ctxFor("read", "acp-denied",),);

    await handler(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "session/new", params: { chatId: CHAT, }, },),);
    const sessionId = out[0]?.result?.sessionId as string;

    out.length = 0;
    await handler(JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "session/prompt",
      params: { sessionId, prompt: [{ type: "text", text: "should be denied", },], },
    },),);

    expect(out,).toHaveLength(1,);
    expect(out[0]?.error?.code,).toBe(-32000,);
    expect(out[0]?.error?.message,).toContain("chat.send",);

    const rows = await db.selectFrom("messages",).selectAll().where("content", "=", "should be denied",).execute();
    expect(rows,).toHaveLength(0,);
  });

  test("session/list, set_mode, resume and additionalDirectories are typed capabilities", async () => {
    resetFacadeRegistry();
    const { out, handler, } = makeAgent(ctxFor("read", "acp-caps",),);

    await handler(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "session/new",
      params: { loopLoreChatId: CHAT, cwd: "/work", additionalDirectories: ["/a", "/b", 42,], },
    },),);

    const sessionId = out[0]?.result?.sessionId as string;

    out.length = 0;
    await handler(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "session/list", params: {}, },),);
    const sessions = out[0]?.result?.sessions as Array<{
      sessionId: string;
      cwd: string | null;
      additionalDirectories: string[];
      modeId: string | null;
    }>;

    expect(sessions,).toHaveLength(1,);
    expect(sessions[0],).toMatchObject({
      sessionId,
      cwd: "/work",
      additionalDirectories: ["/a", "/b",],
      modeId: null,
    },);

    out.length = 0;
    await handler(JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "session/set_mode",
      params: { sessionId, modeId: "plan", },
    },),);

    expect(out[0]?.result?.currentModeId,).toBe("plan",);

    out.length = 0;
    await handler(JSON.stringify({ jsonrpc: "2.0", id: 4, method: "session/resume", params: { sessionId, }, },),);
    expect(out[0]?.result?.sessionId,).toBe(sessionId,);

    out.length = 0;
    await handler(
      JSON.stringify({ jsonrpc: "2.0", id: 5, method: "session/resume", params: { sessionId: "nope", }, },),
    );

    expect(out[0]?.error?.code,).toBe(ACP_ERRORS.unknownSession,);
  });

  test("session/set_config_option applies a configured model and rejects unknown options", async () => {
    resetFacadeRegistry();
    const configured = {
      ...config,
      generation: {
        ...config.generation,
        providers: {
          ...config.generation.providers,
          openaiCompatible: [{
            name: "acp-local",
            label: "ACP local",
            baseUrl: "http://localhost:8080/v1",
            model: "acp-local/test",
            timeout: 1000,
            retries: 1,
            allowUserApiKey: false,
            models: { "acp-local/test": { contextLimit: 4096, maxOutput: 1024, }, },
          },],
        },
      },
    };

    const { out, handler, } = makeAgent(ctxFor("read", "acp-config", configured,),);

    await handler(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "session/new", params: { loopLoreChatId: CHAT, }, },),
    );

    const sessionId = out[0]?.result?.sessionId as string;
    expect(out[0]?.result?.configOptions,).toEqual([{
      id: "model",
      name: "Model",
      type: "select",
      currentValue: "acp-local/test",
      options: [{ value: "acp-local/test", name: "acp-local/test", },],
    },],);

    out.length = 0;
    await handler(JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "Session/Set_Config_Option",
      params: { sessionId, configId: "MODEL_CONFIG_ID", value: "acp-local/test", },
    },),);

    expect(out[0]?.error,).toBeUndefined();
    expect((out[0]?.result?.configOptions as Array<{ currentValue: string }>)[0]?.currentValue,).toBe(
      "acp-local/test",
    );

    out.length = 0;
    await handler(JSON.stringify({ jsonrpc: "2.0", id: 3, method: "session/list", params: {}, },),);
    const sessions = out[0]?.result?.sessions as Array<{ modelId: string | null }>;
    expect(sessions[0]?.modelId,).toBe("acp-local/test",);

    out.length = 0;
    await handler(JSON.stringify({
      jsonrpc: "2.0",
      id: 4,
      method: "session/set_config_option",
      params: { sessionId, configId: "effort", value: "high", },
    },),);

    expect(out[0]?.error,).toMatchObject({
      code: ACP_ERRORS.invalidParams,
      data: { allowedConfigIds: ["model", "MODEL_CONFIG_ID",], allowedValues: ["acp-local/test",], },
    },);

    out.length = 0;
    await handler(JSON.stringify({
      jsonrpc: "2.0",
      id: 5,
      method: "session/set_config_option",
      params: { sessionId, configId: "model", value: "unlisted/model", },
    },),);

    expect(out[0]?.error?.code,).toBe(ACP_ERRORS.invalidParams,);

    out.length = 0;
    await handler(JSON.stringify({ jsonrpc: "2.0", id: 6, method: "session/list", params: {}, },),);
    const after = out[0]?.result?.sessions as Array<{ modelId: string | null }>;
    expect(after[0]?.modelId,).toBe("acp-local/test",);
  });

  test("session/load replays history through the facade chat.history op", async () => {
    resetFacadeRegistry();
    const { out, handler, } = makeAgent(ctxFor("chat-write", "acp-load",),);

    await handler(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "session/new", params: { chatId: CHAT, }, },),);
    const sessionId = out[0]?.result?.sessionId as string;
    await handler(JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "session/prompt",
      params: { sessionId, prompt: [{ type: "text", text: "replay me", },], },
    },),);

    out.length = 0;
    await handler(JSON.stringify({ jsonrpc: "2.0", id: 3, method: "session/load", params: { sessionId, }, },),);
    expect(out.some((message,) => message.method === "session/update"),).toBe(true,);
    expect(out[out.length - 1]?.result,).toEqual({ sessionId, },);
  });

  test("elicitation/create uses the composed responder and fails closed without one", async () => {
    resetFacadeRegistry();
    const seen: unknown[] = [];
    const withHook = makeAgent(ctxFor("read", "acp-elicit-hook",), (request,) => {
      seen.push(request,);
      return Promise.resolve({ action: "accept", },);
    },);

    await withHook.handler(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "session/new", params: { chatId: CHAT, }, },),
    );

    const sessionId = withHook.out[0]?.result?.sessionId as string;
    await withHook.handler(JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "elicitation/create",
      params: { sessionId, message: "Approve the tool?", mode: "form", },
    },),);

    expect(seen,).toEqual([{ sessionId, message: "Approve the tool?", mode: "form", },],);
    expect(withHook.out[1]?.result,).toEqual({ action: "accept", },);

    const plain = makeAgent(ctxFor("read", "acp-elicit-plain",),);
    await plain.handler(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "session/new", params: { chatId: CHAT, }, },),);
    const fallbackId = plain.out[0]?.result?.sessionId as string;
    await plain.handler(JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "elicitation/create",
      params: { sessionId: fallbackId, message: "Approve?", },
    },),);

    expect(plain.out[1]?.result,).toEqual({ action: "decline", },);
  });

  test("unknown session, missing text, unknown method, and unparseable lines are errors", async () => {
    resetFacadeRegistry();
    const { out, handler, } = makeAgent(ctxFor("chat-write", "acp-errors",),);

    await handler(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "session/prompt",
      params: { sessionId: "nope", prompt: [{ type: "text", text: "x", },], },
    },),);

    expect(out[0]?.error?.code,).toBe(-32002,);

    await handler(JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "session/prompt",
      params: { sessionId: "nope", },
    },),);

    expect(out[1]?.error?.code,).toBe(-32002,);

    await handler(JSON.stringify({ jsonrpc: "2.0", id: 3, method: "session/new", params: {}, },),);
    expect(out[2]?.error?.code,).toBe(-32602,);

    await handler(JSON.stringify({ jsonrpc: "2.0", id: 4, method: "totally/unknown", params: {}, },),);
    expect(out[3]?.error?.code,).toBe(-32601,);

    await handler("{this is not json",);
    expect(out[4]?.error?.code,).toBe(-32700,);

    // session/cancel answers only when the client asked for a response.
    await handler(JSON.stringify({ jsonrpc: "2.0", id: 5, method: "SESSION/CANCEL", params: { sessionId: "x", }, },),);
    expect(out[5]?.result,).toEqual({},);
    await handler(JSON.stringify({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId: "x", }, },),);
    expect(out,).toHaveLength(6,);
  });

  test("extractReplyText picks the reply field and falls back to serialization", () => {
    expect(extractReplyText({ reply: "hi", },),).toBe("hi",);
    expect(extractReplyText({ text: "there", },),).toBe("there",);
    expect(extractReplyText({ id: "m1", context: {}, },),).toBe(JSON.stringify({ id: "m1", context: {}, },),);
    expect(extractReplyText(null,),).toBe("null",);
  });
});

describe("ACP_ERRORS — the JSON-RPC error code table", () => {
  test("pins the wire codes callers (Studio) match against", () => {
    expect(ACP_ERRORS.parse,).toBe(-32700,);
    expect(ACP_ERRORS.methodNotFound,).toBe(-32601,);
    expect(ACP_ERRORS.invalidParams,).toBe(-32602,);
    expect(ACP_ERRORS.serverError,).toBe(-32000,);
    expect(ACP_ERRORS.unknownSession,).toBe(-32002,);
  });

  test("exposes exactly the five documented codes", () => {
    expect(Object.keys(ACP_ERRORS,).sort(),).toEqual([
      "invalidParams",
      "methodNotFound",
      "parse",
      "serverError",
      "unknownSession",
    ],);
  });
});
