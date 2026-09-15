/**
 * Tool execution — context forwarding + builtin tool resolution + inline
 * tool-result persistence (BUG-tool-call-result-no-frontend-rendering).
 *
 * Verifies executeToolCalls forwards the per-request execution context to
 * handlers, resolves the builtin write_memory_note tool, preserves the
 * unknown-tool error path, and (when ctx.db is a real Kysely handle) writes
 * a chat-visible `tool_result` row per executed tool call.
 */
import type { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { registry, } from "../../plugins/registry";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, } from "../../test-utils/insert-helpers";
import { WRITE_MEMORY_NOTE, writeMemoryNoteTool, } from "../tools/write-memory-note";
import { executeToolCalls, } from "./tool-execution";

// Bun's mock.module is process-global and cannot be unmocked: without
// --isolate, an earlier file may have replaced ./tool-execution with a stub.
// Arity alone cannot prove the real module (a stub may declare params, as
// stream-to-client.coverage.test.ts once did), so probe behavior: only the
// real module answers an unknown tool with a "Tool not found" error result.
// Skip instead of asserting against a stub (pristine-module guard; see
// generation/providers/registry.test.ts).
const toolExecPristine = await (async () => {
  try {
    const probe = await executeToolCalls([
      { id: "probe", function: { name: "__pristine_probe__", arguments: "{}", }, },
    ],);
    const content = probe[0]?.content;
    return typeof content === "string" && content.includes("Tool not found",);
  } catch {
    return false;
  }
})();
const describeReal = toolExecPristine ? describe : describe.skip;

describeReal("executeToolCalls context forwarding", () => {
  const ctx = { db: {} as never, actorId: "actor-1", chatId: "chat-1", };

  afterEach(() => {
    registry.unregisterAll();
  },);

  test("forwards execution ctx to handler", async () => {
    let received: unknown;
    registry.addTools("test-plugin", [
      {
        name: "echo_ctx",
        description: "echo ctx",
        parameters: {},
        handler: async (_params, handlerCtx,) => {
          received = handlerCtx;
          return { content: "ok", };
        },
      },
    ],);

    const results = await executeToolCalls([
      { id: "call-1", function: { name: "echo_ctx", arguments: "{}", }, },
    ], ctx,);

    expect(received,).toEqual(ctx,);
    expect(results[0]?.role,).toBe("tool",);
    expect(results[0]?.content,).toBe("ok",);
  });

  test("resolves builtin write_memory_note from registry", async () => {
    registry.addTools("core", [writeMemoryNoteTool,],);

    const results = await executeToolCalls([
      { id: "call-2", function: { name: WRITE_MEMORY_NOTE, arguments: "{}", }, },
    ], ctx,);

    expect(results[0]?.content,).toContain("content is required",);
  });

  test("unknown tool yields error result without throwing", async () => {
    const results = await executeToolCalls([
      { id: "call-3", function: { name: "nope", arguments: "{}", }, },
    ], ctx,);

    expect(results[0]?.content,).toContain("Tool not found",);
  });

  test("malformed JSON in arguments emits explicit error without invoking handler", async () => {
    let invoked = false;
    registry.addTools("test-plugin", [
      {
        name: "echo_ctx",
        description: "echo ctx",
        parameters: {},
        handler: async (_params,) => {
          invoked = true;
          return { content: "ok", };
        },
      },
    ],);

    const results = await executeToolCalls([
      { id: "call-malformed", function: { name: "echo_ctx", arguments: '{"name": "foo",}', }, },
    ], ctx,);

    expect(invoked,).toBe(false,);
    expect(results[0]?.tool_call_id,).toBe("call-malformed",);
    const parsed = JSON.parse(results[0]?.content ?? "{}",);
    expect(parsed.error,).toContain("tool arguments must be a JSON object",);
    expect(parsed.received,).toBe('{"name": "foo",}',);
  });
  test("non-object JSON (array) emits explicit error without invoking handler", async () => {
    let invoked = false;
    registry.addTools("test-plugin", [
      {
        name: "echo_ctx",
        description: "echo ctx",
        parameters: {},
        handler: async (_params,) => {
          invoked = true;
          return { content: "ok", };
        },
      },
    ],);

    const results = await executeToolCalls([
      { id: "call-array", function: { name: "echo_ctx", arguments: "[1,2,3]", }, },
    ], ctx,);

    expect(invoked,).toBe(false,);
    expect(results[0]?.tool_call_id,).toBe("call-array",);
    const parsed = JSON.parse(results[0]?.content ?? "{}",);
    expect(parsed.error,).toContain("tool arguments must be a JSON object",);
    expect(parsed.error,).toContain("array",);
  });

  test("null JSON emits explicit error without invoking handler", async () => {
    let invoked = false;
    registry.addTools("test-plugin", [
      {
        name: "echo_ctx",
        description: "echo ctx",
        parameters: {},
        handler: async (_params,) => {
          invoked = true;
          return { content: "ok", };
        },
      },
    ],);

    const results = await executeToolCalls([
      { id: "call-null", function: { name: "echo_ctx", arguments: "null", }, },
    ], ctx,);

    expect(invoked,).toBe(false,);
    expect(results[0]?.tool_call_id,).toBe("call-null",);
    const parsed = JSON.parse(results[0]?.content ?? "{}",);
    expect(parsed.error,).toContain("tool arguments must be a JSON object",);
    expect(parsed.error,).toContain("null",);
  });
},);

describeReal("tool output sanitization (BUG-generation-error-handling-gaps)", () => {
  const ctx = { db: {} as never, actorId: "actor-1", chatId: "chat-1", };

  afterEach(() => {
    registry.unregisterAll();
  },);

  test("strips <script> tags from tool output before re-injection", async () => {
    registry.addTools("test-plugin", [
      {
        name: "noisy_tool",
        description: "returns malicious content",
        parameters: {},
        handler: async () => {
          return { content: 'safe start <script>alert("xss")</script> safe end', };
        },
      },
    ],);

    const results = await executeToolCalls([
      { id: "call-sanitize", function: { name: "noisy_tool", arguments: "{}", }, },
    ], ctx,);

    expect(results[0]?.content,).not.toContain("<script",);
    expect(results[0]?.content,).not.toContain("alert",);
    expect(results[0]?.content,).toContain("safe start",);
    expect(results[0]?.content,).toContain("safe end",);
  });

  test("strips inline on* event handlers from tool output", async () => {
    registry.addTools("test-plugin", [
      {
        name: "noisy_tool",
        description: "returns HTML with on* handlers",
        parameters: {},
        handler: async () => {
          return { content: '<a href="x" onclick="steal()">click</a> <img src="y" onerror="bad()">', };
        },
      },
    ],);

    const results = await executeToolCalls([
      { id: "call-sanitize-on", function: { name: "noisy_tool", arguments: "{}", }, },
    ], ctx,);

    expect(results[0]?.content,).not.toMatch(/onclick/i,);
    expect(results[0]?.content,).not.toMatch(/onerror/i,);
    expect(results[0]?.content,).toContain('<a href="x"',);
  });
});

describeReal("executeToolCalls — persists tool-result rows (BUG-tool-call-result-no-frontend-rendering)", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  const chatId = "chat-tool-exec-persist";
  const actorId = "actor-tool-exec-persist";
  const userId = "user-tool-exec-persist";

  beforeEach(async () => {
    const created = await createTestDb();
    db = created.db;
    sqlite = created.sqlite;

    await db.insertInto("users",).values({
      id: userId,
      username: "toolexecpersist",
      display_name: "Tool Exec Persist",
      role: "solo",
      status: "active",
      settings: "{}",
    },).execute();
    await insertActors(db, "Alice", {
      id: actorId,
      actor_type: "character",
      owner_id: userId,
      agent_type: "ai",
      settings: "{}",
      import_spec: "raw",
      data_source_format: "json",
      data_raw: null,
    } as never,);
    await db.insertInto("chats",).values({
      id: chatId,
      name: "Tool Exec Persist",
      type: "direct",
      mode: "direct",
      created_by: userId,
      max_turns: null,
    } as never,).execute();
    await db.insertInto("chat_participants",).values({
      chat_id: chatId,
      actor_id: actorId,
      role_in_chat: "member",
      talkativity: 5,
    } as never,).execute();
    // The assistant message is inserted so any future FK on
    // `messages.tool_call_id` (none today) would still be satisfiable. The
    // inline persist path writes rows with `parent_id = null` and traces the
    // link through `metadata.tool_call_id`, so the FK is not actually used.
    await db.insertInto("messages",).values({
      id: "assistant-msg-tool-exec",
      chat_id: chatId,
      actor_id: actorId,
      role: "assistant",
      content: "assistant turn",
      content_type: "text",
      content_format: "markdown",
      content_encoding: "identity",
      status: "confirmed",
      visibility: "visible",
      tool_calls: JSON.stringify([
        { id: "tc-1", type: "function", function: { name: "stub_tool", arguments: "{}", }, },
      ],),
    },).execute();
  },);

  afterEach(() => {
    registry.unregisterAll();
    sqlite.close();
  },);

  test("persists one tool_result row per call linked via metadata.tool_call_id", async () => {
    registry.addTools("test-plugin", [
      {
        name: "stub_tool",
        description: "stub",
        parameters: {},
        handler: async () => ({ content: "stub-out", },),
      },
    ],);

    const results = await executeToolCalls(
      [{ id: "tc-1", function: { name: "stub_tool", arguments: "{}", }, },],
      { db, actorId, chatId, },
    );

    const rows = await db
      .selectFrom("messages",)
      .select(["content_type", "metadata", "parent_id", "chat_id",],)
      .where("chat_id", "=", chatId,)
      .where("content_type", "=", "tool_result",)
      .execute();
    expect(rows.length,).toBe(1,);
    expect(rows[0]!.parent_id,).toBeNull();
    expect(rows[0]!.chat_id,).toBe(chatId,);
    expect(JSON.parse(rows[0]!.metadata ?? "{}",),).toEqual({ tool_call_id: "tc-1", },);

    // In-memory return shape is preserved for the next prompt.
    expect(results[0]?.role,).toBe("tool",);
    expect(results[0]?.tool_call_id,).toBe("tc-1",);
  },);

  test("persists a row with error content when the handler throws", async () => {
    registry.addTools("test-plugin", [
      {
        name: "explode_tool",
        description: "explodes",
        parameters: {},
        handler: async () => {
          throw new Error("boom");
        },
      },
    ],);

    const results = await executeToolCalls(
      [{ id: "tc-2", function: { name: "explode_tool", arguments: "{}", }, },],
      { db, actorId, chatId, },
    );

    const rows = await db
      .selectFrom("messages",)
      .select(["content", "metadata",],)
      .where("content_type", "=", "tool_result",)
      .where("chat_id", "=", chatId,)
      .execute();
    expect(rows.length,).toBe(1,);
    expect(JSON.parse(rows[0]!.metadata ?? "{}",),).toEqual({ tool_call_id: "tc-2", },);
    const parsed = JSON.parse(rows[0]!.content,);
    expect(parsed.error,).toBe("boom",);

    // In-memory return still carries the error message.
    expect(results[0]?.role,).toBe("tool",);
    expect(results[0]?.tool_call_id,).toBe("tc-2",);
  },);

  test("persists a row when the tool is not in the registry", async () => {
    const results = await executeToolCalls(
      [{ id: "tc-3", function: { name: "missing_tool", arguments: "{}", }, },],
      { db, actorId, chatId, },
    );

    const rows = await db
      .selectFrom("messages",)
      .select(["metadata",],)
      .where("content_type", "=", "tool_result",)
      .where("chat_id", "=", chatId,)
      .execute();
    expect(rows.length,).toBe(1,);
    expect(JSON.parse(rows[0]!.metadata ?? "{}",),).toEqual({ tool_call_id: "tc-3", },);

    expect(results[0]?.role,).toBe("tool",);
    expect(results[0]?.tool_call_id,).toBe("tc-3",);
  },);

  test("skips persist when ctx.db is absent; in-memory return unchanged", async () => {
    registry.addTools("test-plugin", [
      {
        name: "stub_tool",
        description: "stub",
        parameters: {},
        handler: async () => ({ content: "stub-out", },),
      },
    ],);

    // No ctx → preserve the legacy pure-function behavior.
    const results = await executeToolCalls(
      [{ id: "tc-no-ctx", function: { name: "stub_tool", arguments: "{}", }, },],
    );

    expect(results[0]?.role,).toBe("tool",);
    expect(results[0]?.tool_call_id,).toBe("tc-no-ctx",);
    expect(results[0]?.content,).toBe("stub-out",);
    // No DB to query, but absence of throw is the actual contract: existing
    // callers (e.g. test fixtures with mock ctx) must not regress.
  },);
});
