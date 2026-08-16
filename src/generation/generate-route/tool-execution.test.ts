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
});
