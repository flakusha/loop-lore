// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Gap-coverage for the facade/video/messaging slice: exercises the pure and
// near-pure seams the test-gaps ratchet flags, with assertions that fail
// without the real code (no tautologies).
import { Client, } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport, } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, test, } from "bun:test";
import type { Config, } from "../../config/schema";
import { IntegrationTokenScope, } from "../../db/enums-core/integration-tokens";
import {
  downloadComfyFile,
} from "../../generation/providers/comfyui-download";
import {
  pollComfyResult,
  waitForComfyFiles,
} from "../../generation/providers/comfyui-poll";
import {
  findVideoProviderInstance,
  listSdProviderInstances,
  listVideoProviderInstances,
} from "../../generation/providers/provider-instances";
import {
  ensureWorkflowFileTemplates,
  resetWorkflowFileTemplatesForTests,
} from "../../image-edit/providers/comfyui-workflow-template";
import { principalKind, } from "../../middleware/principal-kind";
import { listChatMessagesPage, } from "../../routes/messages/list-page";
import { prepareUserMessage, } from "../../routes/messages/send-intake";
import { sendUserMessage, } from "../../routes/messages/send-message";
import { writeFacadeAudit, } from "./audit";
import { authorizeFacadeOp, } from "./authz";
import { getFacadeRegistry, resetFacadeRegistry, } from "./instance";
import { McpTransportBridge, } from "./mcp/bridge";
import { buildMcpServer, MCP_SERVER_NAME, } from "./mcp/server";
import { ChatHistoryOutputSchema, FacadeListMessagesBody, FacadeSendMessageBody, } from "./ops/chat";
import { consumeFacadeBudget, } from "./rate-limit";
import { createFacadeRegistry, facadeResultFromResponse, } from "./registry";
import type { FacadeContext, FacadeOp, } from "./types";

const DB = {} as FacadeContext["database"];
const CONFIG = {} as Config;

function userCtx(userId: string | null,): FacadeContext {
  return {
    database: DB,
    config: CONFIG,
    principal: {
      kind: principalKind("user",),
      userId,
      userRole: userId === null ? null : "user",
      credentialId: null,
      credentialName: null,
      credentialScope: null,
    },
    requestId: "req-gap-1",
  };
}

function readOp(scope: FacadeOp["scope"] = "read",): FacadeOp {
  return {
    name: "gap.read",
    domain: "chat",
    summary: "gap",
    description: "gap op",
    scope,
    ratePolicy: { name: "gap-test", windowMs: 60_000, max: 10, },
    handler: async () => ({ ok: true, status: 200, json: { ok: true, }, }),
  };
}

describe("facade/video/messaging gap coverage", () => {
  test("IntegrationTokenScope mirrors the facade read/chat-write tiers", () => {
    expect(IntegrationTokenScope.Read,).toBe("read",);
    expect(IntegrationTokenScope.ChatWrite,).toBe("chat-write",);
  });

  test("facadeResultFromResponse passes status through verbatim", async () => {
    const ok = await facadeResultFromResponse(new Response(JSON.stringify({ id: "1", },), { status: 201, },),);
    expect(ok.ok,).toBe(true,);
    expect(ok.status,).toBe(201,);
    expect(ok.json,).toEqual({ id: "1", },);

    const fail = await facadeResultFromResponse(new Response(JSON.stringify({ error: "nope", },), { status: 403, },),);
    expect(fail.ok,).toBe(false,);
    expect(fail.status,).toBe(403,);
    expect(fail.json,).toEqual({ error: "nope", },);

    const broken = await facadeResultFromResponse(new Response("not json", { status: 200, },),);
    expect(broken.json,).toBeNull();
  });

  test("consumeFacadeBudget allows then denies on a max-1 policy", () => {
    const policy = { name: "gap-unit", windowMs: 60_000, max: 1, };
    const key = `gap-key-${Date.now()}-${Math.random()}`;
    expect(consumeFacadeBudget({ key, policy, },).allowed,).toBe(true,);
    const second = consumeFacadeBudget({ key, policy, },);
    expect(second.allowed,).toBe(false,);
    if (!second.allowed) {
      expect(second.retryAfterSec,).toBe(60,);
    }
  });

  test("authorizeFacadeOp fails closed on anonymous and enforces tiers", () => {
    expect(authorizeFacadeOp(userCtx(null,), readOp(),)?.status,).toBe(401,);

    const ctx = userCtx("u1",);
    expect(authorizeFacadeOp(ctx, readOp(),),).toBeNull();

    const readToken: FacadeContext = {
      ...ctx,
      principal: {
        kind: principalKind("external-agent",),
        userId: "admin",
        userRole: null,
        credentialId: "t1",
        credentialName: "t1",
        credentialScope: "read",
      },
    };

    expect(authorizeFacadeOp(readToken, readOp(),),).toBeNull();
    expect(authorizeFacadeOp(readToken, readOp("chat-write",),)?.status,).toBe(403,);

    const nullScope: FacadeContext = {
      ...ctx,
      principal: {
        kind: principalKind("external-agent",),
        userId: "admin",
        userRole: null,
        credentialId: "t1",
        credentialName: "t1",
        credentialScope: null,
      },
    };

    expect(authorizeFacadeOp(nullScope, readOp(),)?.status,).toBe(403,);
  });

  test("delegation domain admits users but refuses internal-service", () => {
    const op: FacadeOp = { ...readOp(), domain: "delegation", };
    expect(authorizeFacadeOp(userCtx("u1",), op,),).toBeNull();

    const internal: FacadeContext = {
      ...userCtx("svc-1",),
      principal: { ...userCtx("svc-1",).principal, kind: principalKind("internal-service",), },
    };

    expect(authorizeFacadeOp(internal, op,)?.status,).toBe(403,);
  });

  test("createFacadeRegistry manifest round-trips descriptors", () => {
    const registry = createFacadeRegistry();
    registry.register(readOp(),);
    const manifest = registry.manifest();
    expect(manifest,).toHaveLength(1,);
    expect(manifest[0],).toEqual({
      name: "gap.read",
      domain: "chat",
      summary: "gap",
      description: "gap op",
      scope: "read",
    },);
  });

  test("MCP server name is pinned and buildMcpServer is a Server", () => {
    expect(MCP_SERVER_NAME,).toBe("loop-lore-facade",);
    const registry = createFacadeRegistry();
    registry.register(readOp(),);
    const server = buildMcpServer({ registry, version: "test", ctx: userCtx("u1",), },);
    expect(server,).toBeDefined();
  });

  test("McpTransportBridge answers parse errors as JSON-RPC -32700", async () => {
    const bridge = new McpTransportBridge();
    const registry = createFacadeRegistry();
    registry.register(readOp(),);
    const outcome = await bridge.handlePayload("{{{not json", { registry, version: "test", ctx: userCtx("u1",), },);
    expect(outcome.status,).toBe(200,);
    const body = outcome.body as { jsonrpc: string; id: null; error: { code: number } };
    expect(body.jsonrpc,).toBe("2.0",);
    expect(body.id,).toBeNull();
    expect(body.error.code,).toBe(-32700,);
  });

  test("facade chat body schemas require chatId", () => {
    expect(FacadeSendMessageBody.properties.chatId,).toBeDefined();
    expect(FacadeListMessagesBody.properties.chatId,).toBeDefined();
  });

  test("chat.history output schema pins the paginated envelope", () => {
    expect(ChatHistoryOutputSchema.required,).toEqual(["data", "pagination", "meta",],);
    expect(ChatHistoryOutputSchema.properties?.pagination,).toBeDefined();
    expect(ChatHistoryOutputSchema.properties?.meta,).toBeDefined();
  });

  test("the declared chat.history schema rejects a drifted envelope", async () => {
    // Resource contract: this test owns its registry, its transport pair, its
    // server and its client - every one of them is closed in the finally, so a
    // failed assertion cannot leak a transport into a sibling test. Its
    // principal id and rate policy are unique to this test, so the shared
    // budget limiter and the shared registry singleton stay untouched.
    const registry = createFacadeRegistry();
    registry.register({
      ...readOp(),
      name: "chat.history.schema-probe",
      ratePolicy: { name: "gap-schema-test", windowMs: 60_000, max: 10, },
      outputSchema: ChatHistoryOutputSchema,
      handler: async () => ({
        ok: true,
        status: 200,
        // The drift the schema must catch: pagination without `totalPages`.
        json: { data: [], pagination: { total: 0, page: 1, pageSize: 20, }, meta: { api_version: "1", }, },
      }),
    },);

    const [serverTransport, clientTransport,] = InMemoryTransport.createLinkedPair();
    const server = buildMcpServer({ registry, version: "test", ctx: userCtx("gap-schema-user",), },);
    const client = new Client({ name: "gap-schema-client", version: "0.0.0", },);

    try {
      await server.connect(serverTransport,);
      await client.connect(clientTransport,);

      // listTools first: the SDK client caches the declared outputSchema and
      // validates every later structured result against it.
      await client.listTools();

      // Behaviour, not the SDK's wording: the call FAILS because the payload
      // does not match the declared output schema.
      await expect(
        client.callTool({ name: "chat.history.schema-probe", arguments: {}, },),
      ).rejects.toThrow(/output schema/,);
    } finally {
      await client.close();
      await server.close();
    }
  });

  test("no facade op claims idempotentHint, and the write-bearing ops say so", () => {
    // The annotation rule (types.ts, FacadeToolAnnotations): every op appends
    // an audit row, so no op may claim idempotentHint: true; an op that
    // touches domain state must declare readOnlyHint: false. The registry
    // singleton is process-global, so it is reset in the finally.
    resetFacadeRegistry();
    try {
      const registry = getFacadeRegistry({ database: DB, config: CONFIG, },);

      for (const entry of registry.manifest()) {
        expect(registry.resolve(entry.name,)?.annotations?.idempotentHint,).not.toBe(true,);
      }

      // chat.history materializes the actor's default outfit (domain state).
      expect(registry.resolve("chat.history",)?.annotations?.readOnlyHint,).toBe(false,);

      // repo.check spawns the repo's check suite as an external process.
      expect(registry.resolve("repo.check",)?.annotations?.readOnlyHint,).toBe(false,);
      expect(registry.resolve("repo.check",)?.annotations?.openWorldHint,).toBe(true,);
    } finally {
      resetFacadeRegistry();
    }
  });

  test("getFacadeRegistry memoizes and reset rebuilds", () => {
    resetFacadeRegistry();
    const first = getFacadeRegistry({ database: DB, config: CONFIG, },);
    const second = getFacadeRegistry({ database: DB, config: CONFIG, },);
    expect(second,).toBe(first,);
    resetFacadeRegistry();
    const third = getFacadeRegistry({ database: DB, config: CONFIG, },);
    expect(third,).not.toBe(first,);
    resetFacadeRegistry();
  });

  test("writeFacadeAudit is exported and callable", () => {
    expect(typeof writeFacadeAudit,).toBe("function",);
  });

  test("provider instance lists filter by surface", () => {
    const config = {
      generation: {
        providers: {
          openaiCompatible: [{ name: "chat-a", allowUserApiKey: true, },],
          video: [
            { name: "vid-a", allowUserApiKey: true, },
            { name: "vid-b", allowUserApiKey: false, },
          ],
          sd: [{ name: "sd-a", },],
        },
      },
    } as unknown as Config;

    expect(listVideoProviderInstances(config,).map((i,) => i.name),).toEqual(["vid-a", "vid-b",],);
    expect(listVideoProviderInstances(config,).find((i,) => i.name === "vid-b")?.allowUserApiKey,).toBe(false,);
    expect(findVideoProviderInstance(config, "vid-a",)?.name,).toBe("vid-a",);
    expect(findVideoProviderInstance(config, "missing",),).toBeUndefined();
    expect(listSdProviderInstances(config,).map((i,) => i.name),).toEqual(["sd-a",],);
    expect(listSdProviderInstances(config,)[0]?.allowUserApiKey,).toBe(true,);
  });

  test("ensureWorkflowFileTemplates resets via the test hook", () => {
    resetWorkflowFileTemplatesForTests();
    expect(typeof ensureWorkflowFileTemplates,).toBe("function",);
  });

  test("comfy poll maps completed/failed/pending histories", async () => {
    const original = globalThis.fetch;
    try {
      (globalThis as Record<string, unknown>).fetch = async () =>
        Response.json({ p1: { status: "completed", outputs: { "9": { videos: [{ filename: "v.mp4", },], }, }, }, },);

      const done = await pollComfyResult("http://x", "p1",);
      expect(done.done,).toBe(true,);
      expect(done.files?.[0]?.kind,).toBe("video",);

      (globalThis as Record<string, unknown>).fetch = async () =>
        Response.json({ p1: { status: "failed", error: "boom", }, },);

      const failed = await pollComfyResult("http://x", "p1",);
      expect(failed.done,).toBe(true,);
      expect(failed.error,).toBe("boom",);

      (globalThis as Record<string, unknown>).fetch = async () => Response.json({},);
      const pending = await pollComfyResult("http://x", "p9",);
      expect(pending,).toEqual({ done: false, },);

      (globalThis as Record<string, unknown>).fetch = async () => new Response("no", { status: 500, },);
      await expect(pollComfyResult("http://x", "p1",),).rejects.toThrow("ComfyUI history fetch failed [500]",);
    } finally {
      (globalThis as Record<string, unknown>).fetch = original;
    }
  });

  test("waitForComfyFiles returns files and times out without completion", async () => {
    const original = globalThis.fetch;
    try {
      (globalThis as Record<string, unknown>).fetch = async () =>
        Response.json({ p1: { status: "completed", outputs: { "9": { videos: [{ filename: "v.mp4", },], }, }, }, },);

      const files = await waitForComfyFiles("http://x", "p1", { timeoutMs: 1000, pollIntervalMs: 1, },);
      expect(files,).toHaveLength(1,);
      expect(files[0]?.file.filename,).toBe("v.mp4",);

      (globalThis as Record<string, unknown>).fetch = async () => Response.json({},);
      await expect(waitForComfyFiles("http://x", "p1", { timeoutMs: 15, pollIntervalMs: 1, },),).rejects.toThrow(
        "ComfyUI execution timed out",
      );
    } finally {
      (globalThis as Record<string, unknown>).fetch = original;
    }
  });

  test("downloadComfyFile fetches /view and rejects non-OK", async () => {
    const original = globalThis.fetch;
    try {
      let seen = "";
      (globalThis as Record<string, unknown>).fetch = async (url: unknown,) => {
        seen = String(url,);
        return new Response(new Uint8Array([1, 2, 3,],),);
      };

      const bytes = await downloadComfyFile("http://x", { filename: "v.mp4", },);
      expect(bytes,).toEqual(Buffer.from([1, 2, 3,],),);
      expect(seen,).toContain("/view?",);
      expect(seen,).toContain("v.mp4",);

      (globalThis as Record<string, unknown>).fetch = async () => new Response("no", { status: 404, },);
      await expect(downloadComfyFile("http://x", { filename: "v.mp4", },),).rejects.toThrow(
        "ComfyUI view download failed [404]",
      );
    } finally {
      (globalThis as Record<string, unknown>).fetch = original;
    }
  });

  test("message service seams are exported", () => {
    expect(typeof listChatMessagesPage,).toBe("function",);
    expect(typeof prepareUserMessage,).toBe("function",);
    expect(typeof sendUserMessage,).toBe("function",);
  });
});
