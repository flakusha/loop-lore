// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin honkbox status route tests. Both seams are injected: no network, no
 * DB and no module cache state, so tests are order-independent.
 */
import { expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Config, } from "../../config/schema";
import type { Db, } from "../../db";
import {
  type HonkboxProbeResult,
  parseHonkboxCapabilities,
} from "../../integrations/honkbox/capabilities";
import { type HonkboxStatusRouteOpts, honkboxStatusRoutes, } from "./honkbox-status";

const SECRET = "super-secret-honkbox-key";
const BASE = "http://127.0.0.1:9010/v1";
const URL_PATH = "http://localhost/api/v1/admin/honkbox/status";

/** Landed capability document with a queue and one external tool. */
const CAPABILITIES = {
  api_version: "v1",
  server: { name: "honkbox", version: "0.9.0", },
  features: { jobs: true, events: true, blender: true, artifact_delivery: true, },
  auth: { mode: "bearer", },
  tools: {
    tool_choice_honored: ["auto",],
    tool_choice_clamped: [],
    tool_choice_named_function_clamped: false,
    parallel_tool_calls: false,
  },
  queue: {
    gpu_slots: 2,
    queue_wait_secs: 45,
    retry_after_secs: 5,
    kinds: [],
  },
  external_tools: {
    tools: [{
      id: "blender",
      capabilities: ["gltf-binary",],
      devices: ["cpu",],
      available: true,
    },],
  },
  storage: { data_dir_present: true, },
  openapi: "/v1/openapi.json",
  models: "/v1/models",
};

/** A successful probe built from the parsed wire document. */
function successProbe(): HonkboxProbeResult {
  const parsed = parseHonkboxCapabilities(CAPABILITIES,);
  if (!parsed.ok) { throw new Error(`invalid fixture: ${parsed.error}`,); }
  return { ok: true, capabilities: parsed.capabilities, supported: true, latencyMs: 3, cached: true, };
}

/** Build an isolated app with an injected role and route seams. */
function makeApp(
  userRole: string | null,
  overrides: Partial<HonkboxStatusRouteOpts> = {},
  probeCalls: { count: number } = { count: 0, },
) {
  const app = new Elysia({ name: "test-honkbox-status", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId: userRole ? "test-admin" : null,
    userRole,
  }));

  const opts: HonkboxStatusRouteOpts = {
    database: {} as Db,
    config: {} as Config,
    resolveEndpoint: async () => ({ baseUrl: BASE, apiKey: SECRET, }),
    probe: async () => {
      probeCalls.count += 1;
      return successProbe();
    },
    ...overrides,
  };

  return app.use(honkboxStatusRoutes(opts, "/api/v1",),);
}

test("GET /api/v1/admin/honkbox/status requires admin.system", async () => {
  const anonymous = makeApp(null,);
  const plain = makeApp("user",);
  expect((await anonymous.handle(new Request(URL_PATH,),)).status,).toBe(401,);
  expect((await plain.handle(new Request(URL_PATH,),)).status,).toBe(403,);
});

test("unconfigured honkbox reports unavailable without probing", async () => {
  const probeCalls = { count: 0, };
  const app = makeApp("admin", {
    resolveEndpoint: async () => undefined,
    probe: async () => {
      probeCalls.count += 1;
      return successProbe();
    },
  }, probeCalls,);

  const res = await app.handle(new Request(URL_PATH,),);
  expect(res.status,).toBe(200,);
  const body = await res.json() as Record<string, unknown>;
  expect(body.state,).toBe("unavailable",);
  expect(body.availability,).toBe(false,);
  expect(body.configured,).toBe(false,);
  expect(body.reason,).toBe("not-configured",);
  expect(body.gpuSlots,).toBeNull();
  expect(probeCalls.count,).toBe(0,);
});

test("probe failure reports unavailable and never leaks the URL or credential", async () => {
  let probedKey: string | undefined;
  const app = makeApp("admin", {
    probe: async (endpoint,) => {
      probedKey = endpoint.apiKey;
      return {
        ok: false,
        reason: "unreachable",
        detail: `GET ${endpoint.baseUrl}/capabilities failed with key ${String(endpoint.apiKey,)}`,
      };
    },
  },);

  const res = await app.handle(new Request(URL_PATH,),);
  expect(res.status,).toBe(200,);
  const text = await res.text();
  const body = JSON.parse(text,) as Record<string, unknown>;
  expect(probedKey,).toBe(SECRET,);
  expect(body.state,).toBe("unavailable",);
  expect(body.availability,).toBe(false,);
  expect(body.configured,).toBe(true,);
  expect(body.reason,).toBe("unreachable",);
  expect(body.gpuSlots,).toBeNull();
  expect(text,).not.toContain(SECRET,);
  expect(text,).not.toContain(BASE,);
});

test("successful probe exposes queue, flags and external-tool availability", async () => {
  const res = await makeApp("admin",).handle(new Request(URL_PATH,),);
  expect(res.status,).toBe(200,);
  const text = await res.text();
  const body = JSON.parse(text,) as Record<string, unknown>;

  expect(body.state,).toBe("available",);
  expect(body.availability,).toBe(true,);
  expect(body.configured,).toBe(true,);
  expect(body.gpuSlots,).toBe(2,);
  expect(body.queueWaitSecs,).toBe(45,);
  expect(body.retryAfterSecs,).toBe(5,);
  expect(body.jobsEnabled,).toBe(true,);
  expect(body.eventsEnabled,).toBe(true,);
  expect(body.toolsEnabled,).toBe(true,);
  expect(body.externalTools,).toEqual([{ id: "blender", available: true, },],);
  expect(body.cached,).toBe(true,);
  expect(text,).not.toContain(SECRET,);
  expect(text,).not.toContain(BASE,);
});
