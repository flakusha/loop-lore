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
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChatParticipants, insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { getFacadeRegistry, resetFacadeRegistry, } from "../loop-lore-facade/instance";
import type { FacadeContext, } from "../loop-lore-facade/types";
import { ACP_PROTOCOL_VERSION, createAcpAgentHandler, extractReplyText, } from "./agent-server";

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
  error?: { code: number; message: string };
  params?: { sessionId?: string; update?: { sessionUpdate?: string; content?: { text?: string } } };
}

/** One agent connection: handler + captured output. */
function makeAgent(ctx: FacadeContext,) {
  const out: OutMessage[] = [];
  const handler = createAcpAgentHandler({
    registry: getFacadeRegistry({ database: db, config, },),
    ctx,
    write: (message,) => {
      out.push(message as OutMessage,);
    },
  },);

  return { out, handler, };
}

/** The inbound principal context, hand-built (the seam under test lives in
 * principal.ts; here we exercise the AGENT protocol itself). */
function ctxFor(scope: "read" | "chat-write", requestId: string,): FacadeContext {
  return {
    database: db,
    config,
    requestId,
    principal: {
      kind: "external-agent",
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
