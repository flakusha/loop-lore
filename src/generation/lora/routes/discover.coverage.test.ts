// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route coverage for src/generation/lora/routes/discover.ts.
 *
 * Drives `POST /api/lora/discover` through in-process Elysia handles against
 * real loopback HTTP stubs — no module mocks. Covers the auth gate, the
 * single-backend branch (explicit `baseUrl` and config-resolved `baseUrl`),
 * and the all-backends aggregation branch including its models/errors loops.
 */
import { beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Config, } from "../../../config/schema";
import { clearDiscoveryCache, } from "../discovery";
import { discoverRoutes, } from "./discover";

// ── Fixtures ─────────────────────────────────────────────

/** ComfyUI `/object_info` body exposing two LoraLoader LoRA filenames. */
const COMFY_OBJECT_INFO = {
  LoraLoader: {
    input: {
      required: {
        lora_name: [["style/anime.safetensors", "detail/detailer.v1.pt",], {},],
      },
    },
  },
};

/** sd.cpp `/sd-api/v1/models` body: one LoRA file plus one non-LoRA entry. */
const SDCPP_MODELS = {
  data: [
    {
      id: "photo.safetensors",
      object: "model",
      created: 1,
      owned_by: "local",
      root: "photo.safetensors",
      location: "/models/photo.safetensors",
    },
    { id: "readme.txt", object: "model", created: 1, owned_by: "local", },
  ],
};

/** Response body of `POST /api/lora/discover`. */
interface DiscoverBody {
  ok: boolean;
  models?: { name: string; filename: string; path: string; backend: string }[];
  results?: { backend: string; error?: string }[];
  errors?: string[];
  error?: string;
  code?: string;
}

/** A running loopback stub server plus the paths it was asked for. */
interface Stub {
  origin: string;
  paths: string[];
  stop: () => Promise<void>;
}

/**
 * Start a real loopback HTTP stub.
 * @param handler - Produces the response for a request path
 * @param port - Fixed port to bind (0 = kernel-assigned)
 * @returns The running stub
 */
function startStub(handler: (path: string,) => Response, port = 0,): Stub {
  const paths: string[] = [];
  const server = Bun.serve({
    port,
    fetch: (req,) => {
      const path = new URL(req.url,).pathname;
      paths.push(path,);
      return handler(path,);
    },
  },);
  return {
    origin: `http://127.0.0.1:${server.port}`,
    paths,
    stop: async () => {
      await server.stop(true,);
    },
  };
}

/**
 * Minimal ImageProviderConfig for an apiFamily + baseUrl.
 * @param apiFamily
 * @param baseUrl
 */
function provider(apiFamily: string, baseUrl: string,): Record<string, unknown> {
  return {
    name: `${apiFamily}-provider`,
    label: `${apiFamily} Provider`,
    baseUrl,
    apiFamily,
    defaults: { model: "default", steps: 20, width: 512, height: 512, },
    timeout: 10_000,
    generationTimeout: 60_000,
  };
}

/** Config carrying the given sd[] providers. */
function configWithSd(sd: unknown[],): Config {
  return {
    generation: { providers: { sd: sd as never, }, },
  } as unknown as Config;
}

/** Discover app behind an auth-injecting derive (mirrors server middleware). */
function authedApp(config: Config,) {
  return new Elysia()
    .derive(() => ({ userId: "sm-cov-user", userRole: "user", }))
    .use(discoverRoutes(config,),);
}

/** POST helper with a JSON body. */
function post(path: string, body: unknown,): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", },
    body: JSON.stringify(body,),
  },);
}

/** Route record as exposed by the Elysia route table. */
interface RouteRecord {
  method: string;
  path: string;
  handler: (ctx: unknown,) => Promise<Response>;
}

/**
 * Invoke the discover handler with `body.backend` genuinely absent.
 *
 * `app.handle` cannot reach the all-backends branch: Elysia's `t.UnionEnum`
 * substitutes its first member ("comfyui") whenever an optional member is
 * missing, so every HTTP body — including `{}` — takes the single-backend
 * path. Calling the mounted handler directly is the only way to exercise the
 * aggregation branch. Auth context is supplied explicitly, matching the
 * middleware-injected derive used by the HTTP tests above.
 * @param config - App config
 * @param body - Validated body shape to hand the handler
 * @returns The handler's response
 */
async function invokeDiscoverHandler(config: Config, body: unknown,): Promise<Response> {
  const routes = discoverRoutes(config,).routes as unknown as RouteRecord[];
  const route = routes.find((r,) => r.method === "POST" && r.path === "/api/lora/discover");
  if (!route) { throw new Error("discover route is not mounted",); }
  return await route.handler({ body, userId: "sm-cov-user", userRole: "user", },);
}

beforeEach(() => {
  clearDiscoveryCache();
},);

// ── Tests ────────────────────────────────────────────────

describe("POST /api/lora/discover — auth gate", () => {
  test("rejects unauthenticated callers", async () => {
    const app = discoverRoutes({} as Config,);
    const res = await app.handle(post("/api/lora/discover", {},),);
    expect(res.status,).toBe(401,);
    const body = await res.json() as DiscoverBody;
    expect(body.error,).toBe("Unauthorized",);
    expect(body.code,).toBe("UNAUTHORIZED",);
  });

  test("rejects an authenticated context with an empty userId (default-deny)", async () => {
    // The gate is `if (!userId)`, so a falsy-but-present identity is denied
    // too; a future `userId === null` refactor would silently allow it.
    const app = new Elysia()
      .derive(() => ({ userId: "", userRole: "user", }))
      .use(discoverRoutes({} as Config,),);
    const res = await app.handle(post("/api/lora/discover", {},),);
    expect(res.status,).toBe(401,);
    const body = await res.json() as DiscoverBody;
    expect(body.code,).toBe("UNAUTHORIZED",);
  });
});

describe("POST /api/lora/discover — single backend", () => {
  test("discovers comfyui from an explicit baseUrl", async () => {
    const stub = startStub(() => Response.json(COMFY_OBJECT_INFO,));
    try {
      const app = authedApp(configWithSd([],),);
      const res = await app.handle(
        post("/api/lora/discover", { backend: "comfyui", baseUrl: stub.origin, forceRefresh: true, },),
      );
      expect(res.status,).toBe(200,);
      const body = await res.json() as DiscoverBody;
      expect(body.ok,).toBe(true,);
      expect(body.models,).toEqual([
        {
          name: "style/anime",
          filename: "style/anime.safetensors",
          path: "style/anime.safetensors",
          backend: "comfyui",
        },
        {
          name: "detail/detailer.v1",
          filename: "detail/detailer.v1.pt",
          path: "detail/detailer.v1.pt",
          backend: "comfyui",
        },
      ],);
      expect(stub.paths,).toEqual(["/object_info",],);
    } finally {
      await stub.stop();
    }
  });

  test("resolves the sd-server baseUrl from the sdcpp provider config", async () => {
    const stub = startStub(() => Response.json(SDCPP_MODELS,));
    try {
      const app = authedApp(configWithSd([provider("sdcpp", stub.origin,),],),);
      const res = await app.handle(post("/api/lora/discover", { backend: "sd-server", forceRefresh: true, },),);
      expect(res.status,).toBe(200,);
      const body = await res.json() as DiscoverBody;
      expect(body.ok,).toBe(true,);
      expect(body.models,).toEqual([
        {
          name: "photo",
          filename: "photo.safetensors",
          path: "/models/photo.safetensors",
          backend: "sd-server",
        },
      ],);
      expect(stub.paths,).toEqual(["/sd-api/v1/models",],);
    } finally {
      await stub.stop();
    }
  });

  test("comfyui falls back to the documented default localhost URL", async () => {
    // Binds the port `resolveBackendUrls` defaults to (8188 must be free —
    // no other suite binds it), so a hit proves the fallback rather than
    // merely observing a connection error.
    const stub = startStub(() => Response.json(COMFY_OBJECT_INFO,), 8188,);
    try {
      const app = authedApp({} as Config,);
      const res = await app.handle(post("/api/lora/discover", { backend: "comfyui", forceRefresh: true, },),);
      expect(res.status,).toBe(200,);
      const body = await res.json() as DiscoverBody;
      expect(body.ok,).toBe(true,);
      expect(body.models?.map((m,) => m.name),).toEqual(["style/anime", "detail/detailer.v1",],);
      expect(stub.paths,).toEqual(["/object_info",],);
    } finally {
      await stub.stop();
    }
  });

  test("sd-server falls back to the documented default localhost URL", async () => {
    // Same trick as the comfyui default: bind 9010 (must be free).
    const stub = startStub(() => Response.json(SDCPP_MODELS,), 9010,);
    try {
      const app = authedApp({} as Config,);
      const res = await app.handle(post("/api/lora/discover", { backend: "sd-server", forceRefresh: true, },),);
      expect(res.status,).toBe(200,);
      const body = await res.json() as DiscoverBody;
      expect(body.ok,).toBe(true,);
      expect(body.models?.map((m,) => m.name),).toEqual(["photo",],);
      expect(stub.paths,).toEqual(["/sd-api/v1/models",],);
    } finally {
      await stub.stop();
    }
  });
});

describe("POST /api/lora/discover — all backends", () => {
  /** Serves the ComfyUI body on /object_info and the sd.cpp body elsewhere. */
  function backendHandler(path: string,): Response {
    if (path === "/object_info") { return Response.json(COMFY_OBJECT_INFO,); }
    if (path === "/sd-api/v1/models") { return Response.json(SDCPP_MODELS,); }
    return new Response("not found", { status: 404, },);
  }

  test("a `{}` HTTP body still takes the single-backend branch", async () => {
    // Elysia substitutes the first UnionEnum member for a missing optional
    // member, so no HTTP body can leave `backend` undefined — see
    // invokeDiscoverHandler for how the aggregation branch is reached.
    const stub = startStub(backendHandler,);
    try {
      const app = authedApp(configWithSd([provider("comfyui", stub.origin,), provider("sdcpp", stub.origin,),],),);
      const res = await app.handle(post("/api/lora/discover", {},),);
      expect(res.status,).toBe(200,);
      const body = await res.json() as DiscoverBody;
      expect(body.ok,).toBe(true,);
      expect(body.models?.map((m,) => m.backend),).toEqual(["comfyui", "comfyui",],);
      expect(body.results,).toBeUndefined();
      expect(stub.paths,).toEqual(["/object_info",],);
    } finally {
      await stub.stop();
    }
  });

  test("aggregates models from every configured backend", async () => {
    const stub = startStub(backendHandler,);
    try {
      const config = configWithSd([provider("comfyui", stub.origin,), provider("sdcpp", stub.origin,),],);
      const res = await invokeDiscoverHandler(config, { forceRefresh: true, },);
      expect(res.status,).toBe(200,);
      const body = await res.json() as DiscoverBody;
      expect(body.ok,).toBe(true,);
      expect(body.models?.map((m,) => m.backend),).toEqual(["comfyui", "comfyui", "sd-server",],);
      expect(body.models?.map((m,) => m.name),).toEqual(["style/anime", "detail/detailer.v1", "photo",],);
      expect(body.results?.map((r,) => r.backend),).toEqual(["comfyui", "sd-server",],);
      expect(body.errors,).toBeUndefined();
      expect(stub.paths.toSorted(),).toEqual(["/object_info", "/sd-api/v1/models",],);
    } finally {
      await stub.stop();
    }
  });

  test("keeps successful backends and reports the failing one", async () => {
    const stub = startStub((path,) =>
      path === "/object_info" ? new Response("boom", { status: 500, },) : Response.json(SDCPP_MODELS,)
    );
    try {
      const config = configWithSd([provider("comfyui", stub.origin,), provider("sdcpp", stub.origin,),],);
      const res = await invokeDiscoverHandler(config, { forceRefresh: true, },);
      expect(res.status,).toBe(200,);
      const body = await res.json() as DiscoverBody;
      expect(body.ok,).toBe(false,);
      expect(body.models?.map((m,) => m.backend),).toEqual(["sd-server",],);
      expect(body.errors,).toHaveLength(1,);
      expect(body.errors?.[0]?.startsWith("ComfyUI returned 500",),).toBe(true,);
      expect(body.results,).toHaveLength(2,);
      expect(body.results?.[0]?.error,).toBe(body.errors?.[0],);
    } finally {
      await stub.stop();
    }
  });
});
