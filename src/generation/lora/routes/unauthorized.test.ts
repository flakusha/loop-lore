// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Authentication-branch coverage for the LoRA HTTP routes
 * (src/generation/lora/routes/validate.ts, discover.ts, management.ts).
 *
 * Every endpoint rejects unauthenticated callers with 401 before touching
 * any backend. Authenticated management/validate paths read only in-memory
 * state (discovery cache, pure config validation) and are tested through
 * an auth-injecting derive; live-backend discovery stays in integration
 * tests. All calls run through in-process Elysia handles — no network.
 */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Config, } from "../../../config/schema";
import { discoverRoutes, } from "./discover";
import { loraManagementRoutes, } from "./management";
import { loraValidateRoutes, } from "./validate";

/** Validate app behind an auth-injecting derive (mirrors server middleware). */
function validateApp() {
  return new Elysia()
    .derive(() => ({ userId: "sm-cov-user", userRole: "user", }))
    .use(loraValidateRoutes(),);
}

/** Management app behind an auth-injecting derive. */
function managementApp() {
  return new Elysia()
    .derive(() => ({ userId: "sm-cov-user", userRole: "user", }))
    .use(loraManagementRoutes(),);
}

/** POST helper with a JSON body and no auth context. */
function post(path: string, body: unknown,): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", },
    body: JSON.stringify(body,),
  },);
}

/** GET helper with no auth context. */
function get(path: string,): Request {
  return new Request(`http://localhost${path}`, { method: "GET", },);
}

describe("LoRA routes — unauthenticated callers get 401", () => {
  test("POST /api/lora/validate rejects without auth", async () => {
    const app = loraValidateRoutes();
    const res = await app.handle(post("/api/lora/validate", {
      name: "test-lora",
      strength: 0.5,
      backend: "comfyui",
    },),);
    expect(res.status,).toBe(401,);
    const body = await res.json() as { error: string; code: string };
    expect(body.code,).toBe("UNAUTHORIZED",);
  });

  test("POST /api/lora/discover rejects without auth", async () => {
    // Auth gate runs before the handler reads config, so an empty stub is
    // sufficient — and keeps this test hermetic (loadConfig needs the
    // global logger, which unit-test processes may not initialize).
    const app = discoverRoutes({} as Config,);
    const res = await app.handle(post("/api/lora/discover", {},),);
    expect(res.status,).toBe(401,);
  });

  test("GET /api/lora/list rejects without auth", async () => {
    const app = loraManagementRoutes();
    const res = await app.handle(get("/api/lora/list",),);
    expect(res.status,).toBe(401,);
  });

  test("GET /api/lora/status rejects without auth", async () => {
    const app = loraManagementRoutes();
    const res = await app.handle(get("/api/lora/status",),);
    expect(res.status,).toBe(401,);
  });

  test("POST /api/lora/clear rejects without auth", async () => {
    const app = loraManagementRoutes();
    const res = await app.handle(post("/api/lora/clear", {},),);
    expect(res.status,).toBe(401,);
  });
});

describe("LoRA routes — authenticated in-memory paths", () => {
  test("POST /api/lora/validate accepts a valid config", async () => {
    const app = validateApp();
    const res = await app.handle(post("/api/lora/validate", {
      name: "test-lora",
      strength: 0.5,
      backend: "comfyui",
    },),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { ok: boolean; config: { name: string } };
    expect(body.ok,).toBe(true,);
    expect(body.config.name,).toBe("test-lora",);
  });

  test("GET /api/lora/list returns the cache snapshot", async () => {
    const app = managementApp();
    const res = await app.handle(get("/api/lora/list",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { ok: boolean; count: number; models: unknown[] };
    expect(body.ok,).toBe(true,);
    expect(body.count,).toBe(body.models.length,);
  });

  test("GET /api/lora/list honors backend and search filters", async () => {
    const app = managementApp();
    const res = await app.handle(get("/api/lora/list?backend=comfyui&search=nope",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { ok: boolean; models: unknown[] };
    expect(body.ok,).toBe(true,);
    expect(Array.isArray(body.models,),).toBe(true,);
  });

  test("GET /api/lora/status returns cache status", async () => {
    const app = managementApp();
    const res = await app.handle(get("/api/lora/status",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { ok: boolean };
    expect(body.ok,).toBe(true,);
  });

  test("POST /api/lora/clear clears a backend cache", async () => {
    const app = managementApp();
    const res = await app.handle(post("/api/lora/clear", { backend: "comfyui", },),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { ok: boolean; cleared: string };
    expect(body.ok,).toBe(true,);
    expect(body.cleared,).toBe("comfyui",);
  });

  test("POST /api/lora/clear defaults a missing backend", async () => {
    const app = managementApp();
    const res = await app.handle(post("/api/lora/clear", {},),);
    expect(res.status,).toBe(200,);
    // Elysia fills a missing optional UnionEnum with its first member, so
    // the route reports "comfyui"; the `?? "all"` fallback is unreachable
    // via HTTP and stays as defensive dead code.
    const body = await res.json() as { ok: boolean; cleared: string };
    expect(body.cleared,).toBe("comfyui",);
  });
});
