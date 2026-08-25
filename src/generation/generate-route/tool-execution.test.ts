/**
 * Tool execution — context forwarding + builtin tool resolution.
 *
 * Verifies executeToolCalls forwards the per-request execution context to
 * handlers, resolves the builtin write_memory_note tool, and preserves the
 * unknown-tool error path.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import { registry, } from "../../plugins/registry";
import { WRITE_MEMORY_NOTE, writeMemoryNoteTool, } from "../tools/write-memory-note";
import { executeToolCalls, } from "./tool-execution";

describe("executeToolCalls context forwarding", () => {
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
});
