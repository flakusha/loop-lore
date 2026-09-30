// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for the image-edit HTTP surface (`src/image-edit/routes.ts`):
 * template/backend/category discovery, node + capability + health probes, the
 * POST /run validation ladder, and the `handleImageGeneration`-parity authz
 * gates (401 unauthenticated, 403 foreign chat/message — IDOR write closed).
 *
 * No ComfyUI or sd-server runs here: both providers are pointed at a port
 * nothing is listening on (kernel-assigned, reserved then released in
 * `beforeAll`), so every probe fails fast with ECONNREFUSED rather than
 * sitting on the 120s workflow timeout. That pins the 500 branch and the
 * false health reports without a network double — and without depending on
 * any fixed port being free, which silently broke these assertions whenever
 * another process on the host happened to hold 8188.
 */
import { afterAll, beforeAll, describe, expect, mock, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { connect, } from "node:net";
import * as realConfigLoad from "../config/load";
import { setTestDatabase, } from "../db";
import { MessageRole, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { handleRun, handleTemplates, imageEditRoutes, } from "./routes";
import { templateRegistry, } from "./template-registry";
import type { ImageEditBackend, WorkflowTemplate, } from "./types";

// Exercises the prefix the app actually mounts (src/routes/v1/content-surface.ts),
// not the `/api` default, so the shipped surface stays covered.
const V1_PREFIX = "/api/v1";
const BASE = `http://localhost${V1_PREFIX}/image-edit`;

/** Template summary returned by GET /templates (build function stripped). */
interface TemplateSummary {
  id: string;
  category: string;
  backends: string[];
}

/** Success envelope shape of the image-edit JSON responses. */
interface Envelope<T,> {
  data: T;
}

/** Error envelope shape of `jsonError`. */
interface ErrorEnvelope {
  error: string;
  code: string;
}

let db: Kysely<DB>;
// `Elysia` bare type rejects `.use(plugin-with-routes)` generics; the mounts
// below only need `.handle`, so infer the type from construction.
let app: ReturnType<typeof buildAnonApp>;
let authedApp: ReturnType<typeof buildAuthedApp>;
/** Chats owned by `ownerId`, plus a stranger-owned chat + a message in each. */
let ownerId = "";
let strangerId = "";
let chatId = "";
let foreignChatId = "";
let messageId = "";
let foreignMessageId = "";

function jsonRequest(url: string, method: string, body: Record<string, unknown>,) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", },
    body: JSON.stringify(body,),
  },);
}

/**
 * Fill every required parameter declared by a registered template.
 * @param templateId
 */
function requiredParamsFor(templateId: string,): Record<string, string> {
  const params: Record<string, string> = {};
  for (const parameter of templateRegistry.get(templateId,)?.parameters ?? []) {
    if (parameter.required) { params[parameter.name] = "coverage"; }
  }
  return params;
}

function buildAnonApp() {
  return new Elysia().use(imageEditRoutes({ database: db, }, V1_PREFIX,),);
}

function buildAuthedApp() {
  return new Elysia()
    .derive(() => ({ userId: ownerId, userRole: "user", }))
    .use(imageEditRoutes({ database: db, }, V1_PREFIX,),);
}

/**
 * Reserve a kernel-assigned ephemeral port, release it, and confirm the release
 * actually left it unbound. A concurrent binder can reclaim the port in the gap
 * between `stop()` and the probe — that is exactly the false-healthy failure this
 * suite exists to rule out — so re-pick until the port is verifiably refused.
 */
async function reserveDeadPort(): Promise<number> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const dead = Bun.serve({ port: 0, fetch: () => new Response("ok",), },);
    const { port, } = dead;
    if (port === undefined) {
      await dead.stop(true,);
      continue;
    }
    await dead.stop(true,);
    if (await isConnectionRefused(port,)) { return port; }
  }
  throw new Error("could not reserve an unreachable port: every candidate was reclaimed",);
}

/** Whether a TCP connect to 127.0.0.1:<port> is refused (nothing is listening). */
function isConnectionRefused(port: number,): Promise<boolean> {
  const { promise, resolve, } = Promise.withResolvers<boolean>();
  const socket = connect({ port, host: "127.0.0.1", },);
  const settle = (refused: boolean,) => {
    socket.removeAllListeners();
    socket.destroy();
    resolve(refused,);
  };
  socket.once("connect", () => settle(false,),);
  socket.once("error", (err: NodeJS.ErrnoException,) => settle(err.code === "ECONNREFUSED",),);
  return promise;
}

beforeAll(async () => {
  // Point every SD provider at a port nothing is listening on, verified by
  // probe. ComfyUI's provider otherwise falls back to a hardcoded
  // 127.0.0.1:8188, so each "backend is unreachable" assertion below was
  // really asserting "nothing else on this host holds 8188" — untrue the
  // moment a second worktree runs its own suite.
  const deadPort = await reserveDeadPort();
  mock.module("../config/load", () => ({
    ...realConfigLoad,
    loadConfig: () => ({
      generation: {
        providers: {
          sd: [
            {
              name: "unreachable-edit-backend",
              label: "Unreachable Edit Backend",
              baseUrl: `http://127.0.0.1:${deadPort}`,
              apiFamily: "comfyui",
              purpose: "edit",
              defaults: { model: "default", steps: 20, width: 512, height: 512, },
              timeout: 10_000,
              generationTimeout: 60_000,
            },
          ],
        },
      },
    }),
  }),);
  const testDb = await createTestDb();
  db = testDb.db;
  setTestDatabase(db,);

  ownerId = uid();
  strangerId = uid();
  chatId = uid();
  foreignChatId = uid();
  messageId = uid();
  foreignMessageId = uid();

  await insertUsers(db, `user-${ownerId}`, "Owner", { id: ownerId, } as never,);
  await insertUsers(db, `user-${strangerId}`, "Stranger", { id: strangerId, } as never,);
  await insertActors(db, "Owner", { id: ownerId, actor_type: "user", user_id: ownerId, } as never,);
  await insertActors(db, "Stranger", {
    id: strangerId,
    actor_type: "user",
    user_id: strangerId,
  } as never,);
  await insertChats(db, "Edit Chat", ownerId, { id: chatId, } as never,);
  await insertChats(db, "Foreign Chat", strangerId, { id: foreignChatId, } as never,);
  await insertChatParticipants(db, chatId, ownerId, { role_in_chat: "owner", } as never,);
  await insertChatParticipants(db, foreignChatId, strangerId, { role_in_chat: "owner", } as never,);
  await insertMessages(db, chatId, ownerId, MessageRole.User, "edit me", {
    id: messageId,
    swipe_index: 0,
  } as never,);
  await insertMessages(db, foreignChatId, strangerId, MessageRole.User, "not yours", {
    id: foreignMessageId,
    swipe_index: 0,
  } as never,);

  // Unauthed mount: no derive, so `userId` is undefined → 401 on POST /run.
  app = buildAnonApp();
  // Authed mount: derive injects the owner, mirroring elysia-app's auth
  // derive + the generation controller's `ctx as unknown as { userId }` read.
  authedApp = buildAuthedApp();
},);

afterAll(async () => {
  mock.module("../config/load", () => realConfigLoad,);
  setTestDatabase(null,);
  await db.destroy();
},);

describe("GET /api/v1/image-edit/templates", () => {
  test("lists builtin template summaries with the build function stripped", async () => {
    const res = await app.handle(new Request(`${BASE}/templates`,),);
    expect(res.status,).toBe(200,);

    const body = (await res.json()) as Envelope<TemplateSummary[]>;
    expect(Array.isArray(body.data,),).toBe(true,);
    expect(body.data.length,).toBeGreaterThan(0,);
    expect(body.data.map((t,) => t.id),).toEqual(
      expect.arrayContaining(["txt2img", "img2img", "inpaint", "upscale", "controlnet",],),
    );

    for (const summary of body.data) {
      expect(summary,).not.toHaveProperty("build",);
    }
  });

  test("filters by backend", async () => {
    const res = await app.handle(new Request(`${BASE}/templates?backend=comfyui`,),);
    expect(res.status,).toBe(200,);

    const body = (await res.json()) as Envelope<TemplateSummary[]>;
    expect(body.data.length,).toBeGreaterThan(0,);
    for (const summary of body.data) {
      expect(summary.backends,).toContain("comfyui",);
    }
  });

  test("filters by category", async () => {
    const res = await app.handle(new Request(`${BASE}/templates?category=txt2img`,),);
    expect(res.status,).toBe(200,);

    const body = (await res.json()) as Envelope<TemplateSummary[]>;
    expect(body.data.map((t,) => t.id),).toEqual(["txt2img",],);
    expect(body.data.map((t,) => t.category),).toEqual(["txt2img",],);
  });
});

describe("GET /api/v1/image-edit/nodes", () => {
  test("answers 200 with a discovery array when ComfyUI is unreachable", async () => {
    const res = await app.handle(new Request(`${BASE}/nodes`,),);
    expect(res.status,).toBe(200,);

    const body = (await res.json()) as Envelope<string[]>;
    expect(Array.isArray(body.data,),).toBe(true,);
  });
});

describe("GET /api/v1/image-edit/capabilities", () => {
  test("reports both backends, marking the unreachable one unhealthy", async () => {
    const res = await app.handle(new Request(`${BASE}/capabilities`,),);
    expect(res.status,).toBe(200,);

    const body = (await res.json()) as Envelope<
      Record<string, { healthy: boolean; features: string[] }>
    >;
    const comfyui = body.data.comfyui;
    const sdServer = body.data["sd-server"];

    expect(comfyui,).toBeDefined();
    expect(sdServer,).toBeDefined();
    expect(comfyui?.healthy,).toBe(false,);
    expect(comfyui?.features,).toEqual([],);
    expect(sdServer?.healthy,).toBe(false,);
    expect(sdServer?.features,).toContain("txt2img",);
  });
});

describe("GET /api/v1/image-edit/health", () => {
  test("reports both backends unhealthy", async () => {
    const res = await app.handle(new Request(`${BASE}/health`,),);
    expect(res.status,).toBe(200,);

    const body = (await res.json()) as { comfyui: boolean; "sd-server": boolean };
    expect(body.comfyui,).toBe(false,);
    expect(body["sd-server"],).toBe(false,);
  });
});

describe("POST /api/v1/image-edit/run — authz gates (handleImageGeneration parity)", () => {
  test("401 without authentication (no derive on the mount)", async () => {
    const res = await app.handle(
      jsonRequest(`${BASE}/run`, "POST", { template_id: "txt2img", backend: "comfyui", params: {}, },),
    );
    expect(res.status,).toBe(401,);
  });

  test("403 for a foreign chatId (IDOR write closed)", async () => {
    const res = await authedApp.handle(
      jsonRequest(`${BASE}/run`, "POST", {
        template_id: "txt2img",
        backend: "comfyui",
        params: {},
        chatId: foreignChatId,
      },),
    );
    expect(res.status,).toBe(403,);
  });

  test("403 for a foreign messageId (message-anchored IDOR closed)", async () => {
    const res = await authedApp.handle(
      jsonRequest(`${BASE}/run`, "POST", {
        template_id: "txt2img",
        backend: "comfyui",
        params: {},
        messageId: foreignMessageId,
      },),
    );
    expect(res.status,).toBe(403,);
  });

  test("403 for an unknown messageId (no chat oracle)", async () => {
    const res = await authedApp.handle(
      jsonRequest(`${BASE}/run`, "POST", {
        template_id: "txt2img",
        backend: "comfyui",
        params: {},
        messageId: "missing-message",
      },),
    );
    expect(res.status,).toBe(403,);
  });
});

describe("POST /api/v1/image-edit/run", () => {
  test("400 on an unparseable JSON body", async () => {
    const res = await authedApp.handle(
      new Request(`${BASE}/run`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: "{ not json",
      },),
    );
    expect(res.status,).toBe(400,);
    expect(await res.json(),).toMatchObject({ error: "Invalid request body", },);
  });

  test("400 when template_id is missing", async () => {
    const res = await authedApp.handle(
      jsonRequest(`${BASE}/run`, "POST", { backend: "comfyui", },),
    );
    expect(res.status,).toBe(400,);

    const body = (await res.json()) as ErrorEnvelope;
    expect(body.error,).toContain("template_id",);
  });

  test("400 when backend is missing", async () => {
    const res = await authedApp.handle(
      jsonRequest(`${BASE}/run`, "POST", { template_id: "txt2img", },),
    );
    expect(res.status,).toBe(400,);

    const body = (await res.json()) as ErrorEnvelope;
    expect(body.error,).toContain("backend",);
  });

  test("404 for an unknown template", async () => {
    const res = await authedApp.handle(
      jsonRequest(`${BASE}/run`, "POST", { template_id: "no-such-template", backend: "comfyui", },),
    );
    expect(res.status,).toBe(404,);

    const body = (await res.json()) as ErrorEnvelope;
    expect(body.error,).toContain("Unknown template: no-such-template",);
  });

  test("400 when the template does not support the requested backend", async () => {
    const comfyuiOnly = templateRegistry
      .listForBackend("comfyui",)
      .find((t,) => !t.backends.includes("sd-server",));
    if (!comfyuiOnly) {
      throw new Error("Expected a ComfyUI-only template in the builtin registry",);
    }

    const res = await authedApp.handle(
      jsonRequest(`${BASE}/run`, "POST", { template_id: comfyuiOnly.id, backend: "sd-server", },),
    );
    expect(res.status,).toBe(400,);

    const body = (await res.json()) as ErrorEnvelope;
    expect(body.error,).toContain(`Template "${comfyuiOnly.id}" does not support backend "sd-server"`,);
  });

  test("400 listing the required parameters that were not supplied", async () => {
    const requiredParams = requiredParamsFor("txt2img",);
    expect(Object.keys(requiredParams,).length,).toBeGreaterThan(0,);

    const res = await authedApp.handle(
      jsonRequest(`${BASE}/run`, "POST", { template_id: "txt2img", backend: "comfyui", params: {}, },),
    );
    expect(res.status,).toBe(400,);

    const body = (await res.json()) as ErrorEnvelope;
    expect(body.error,).toContain(`Missing required parameters: ${Object.keys(requiredParams,).join(", ",)}`,);
  });

  test("500 when the ComfyUI backend refuses the connection", async () => {
    const requiredParams = requiredParamsFor("txt2img",);

    const res = await authedApp.handle(
      jsonRequest(`${BASE}/run`, "POST", {
        template_id: "txt2img",
        backend: "comfyui",
        params: requiredParams,
      },),
    );
    expect(res.status,).toBe(500,);

    const body = (await res.json()) as ErrorEnvelope;
    expect(body.error,).toContain("Image edit failed",);
  });

  test("500 when the sd-server backend is unconfigured", async () => {
    const sdTemplate = templateRegistry
      .listForBackend("sd-server",)
      .find((t,) => t.parameters.some((p,) => p.required));
    if (!sdTemplate) {
      throw new Error("Expected an sd-server template with required parameters",);
    }
    const params = requiredParamsFor(sdTemplate.id,);

    const res = await authedApp.handle(
      jsonRequest(`${BASE}/run`, "POST", { template_id: sdTemplate.id, backend: "sd-server", params, },),
    );
    expect(res.status,).toBe(500,);

    const body = (await res.json()) as ErrorEnvelope;
    expect(body.error,).toContain("Image edit failed",);
  });

  test("500 when a registered template declares an unsupported backend", async () => {
    const template: WorkflowTemplate = {
      id: "coverage-unsupported-backend",
      name: "Coverage Only",
      category: "txt2img",
      backends: ["mystery" as ImageEditBackend,],
      description: "Registered by routes.coverage.test.ts",
      required_nodes: [],
      parameters: [],
      build: () => ({}),
    };
    templateRegistry.register(template,);

    try {
      const res = await authedApp.handle(
        jsonRequest(`${BASE}/run`, "POST", { template_id: template.id, backend: template.backends[0], },),
      );
      // `getProvider` throws before handleRun's own try/catch, so Elysia's
      // error handler renders the 500 with the raw message as the body.
      expect(res.status,).toBe(500,);
      expect(await res.text(),).toContain("Unknown backend: mystery",);
    } finally {
      templateRegistry.unregister(template.id,);
    }
  });
});

describe("exported handlers", () => {
  test("handleTemplates is callable without the Elysia mount; handleRun needs auth", async () => {
    const listRes = handleTemplates(new Request(`${BASE}/templates`,),);
    expect(listRes.status,).toBe(200,);
    const listed = (await listRes.json()) as Envelope<TemplateSummary[]>;
    expect(listed.data.length,).toBeGreaterThan(0,);

    // No userId → 401 before any validation branch is reached.
    const runRes = await handleRun(jsonRequest(`${BASE}/run`, "POST", { template_id: "txt2img", },),);
    expect(runRes.status,).toBe(401,);

    // Owner-scoped call reaches the validation ladder (400, not 401/403).
    const scopedRes = await handleRun(
      jsonRequest(`${BASE}/run`, "POST", { template_id: "txt2img", chatId, },),
      { database: db, userId: ownerId, userRole: "user", },
    );
    expect(scopedRes.status,).toBe(400,);
  });
});
