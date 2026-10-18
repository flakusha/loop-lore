/**
 * Tests for health routes.
 *
 * healthRoutes returns an Elysia plugin. We test via its .handle() method
 * (the standard fetch handler). No DB or I/O needed — the handler reads
 * from the global provider health cache.
 */
import { beforeAll, describe, expect, test, } from "bun:test";
import { resetHealthCache, scanAllProviders, } from "../admin/provider-health";
import { getProvider, registerProvider, unregisterProvider, } from "../generation/providers/registry";
import type { LLMProvider, } from "../generation/providers/types";
import { createLogger, } from "../logger";
import { healthRoutes, } from "./health";

// Bun's mock.module is process-global and cannot be unmocked: under
// `bun run` an earlier file (e.g.
// admin/provider-health-isolated.test.ts) may have replaced the provider
// registry with fakes including an unhealthy provider, flipping health to
// degraded. A sentinel roundtrip detects ANY registry stub; skip instead
// of asserting against one (pristine-module guard; see
// generation/providers/registry.test.ts).
const REGISTRY_PROBE_PROVIDER = "__health_pristine_probe__";
const registryPristine = (() => {
  try {
    // Registry stubs export only listProviders/getProvider — a missing
    // register/unregister means stubbed.
    if (typeof registerProvider !== "function" || typeof unregisterProvider !== "function") { return false; }
    registerProvider(REGISTRY_PROBE_PROVIDER, { label: "probe", } as never,);
    const hit = getProvider(REGISTRY_PROBE_PROVIDER,) !== undefined;
    unregisterProvider(REGISTRY_PROBE_PROVIDER,);
    return hit;
  } catch {
    return false;
  }
})();

const describeReal = registryPristine ? describe : describe.skip;

beforeAll(() => {
  try {
    createLogger({ level: "error", },);
  } catch {
    // Logger already initialized by another test file — reuse it.
  }
},);

describeReal("healthRoutes", () => {
  test("GET /api/health returns 200", async () => {
    const app = healthRoutes({} as never,);
    const res = await app.handle(new Request("http://localhost/api/health",),);
    expect(res.status,).toBe(200,);
  });

  test("returns JSON with status, uptime, timestamp, providers", async () => {
    const app = healthRoutes({} as never,);
    const res = await app.handle(new Request("http://localhost/api/health",),);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body,).toHaveProperty("status",);
    expect(body,).toHaveProperty("uptime",);
    expect(body,).toHaveProperty("timestamp",);
    expect(body,).toHaveProperty("providers",);
    expect(Array.isArray(body.providers,),).toBe(true,);
  });

  test("status is 'ok' when no providers are unhealthy", async () => {
    const app = healthRoutes({} as never,);
    const res = await app.handle(new Request("http://localhost/api/health",),);
    const body = (await res.json()) as { status: string };
    expect(body.status,).toBe("ok",);
  });

  test("uptime is a non-negative integer", async () => {
    const app = healthRoutes({} as never,);
    const res = await app.handle(new Request("http://localhost/api/health",),);
    const body = (await res.json()) as { uptime: number };
    expect(body.uptime,).toBeGreaterThanOrEqual(0,);
    expect(Number.isInteger(body.uptime,),).toBe(true,);
  });

  test("timestamp is a valid ISO 8601 string", async () => {
    const app = healthRoutes({} as never,);
    const res = await app.handle(new Request("http://localhost/api/health",),);
    const body = (await res.json()) as { timestamp: string };
    expect(new Date(body.timestamp,).toISOString(),).toBe(body.timestamp,);
  });

  test("providers is an array (may be empty)", async () => {
    const app = healthRoutes({} as never,);
    const res = await app.handle(new Request("http://localhost/api/health",),);
    const body = (await res.json()) as { providers: unknown[] };
    expect(Array.isArray(body.providers,),).toBe(true,);
  });

  test("unknown route returns 404 from Elysia", async () => {
    const app = healthRoutes({} as never,);
    const res = await app.handle(new Request("http://localhost/api/unknown",),);
    expect(res.status,).toBe(404,);
  });

  test("wrong method returns 404", async () => {
    const app = healthRoutes({} as never,);
    const res = await app.handle(new Request("http://localhost/api/health", { method: "POST", },),);
    expect(res.status,).toBe(404,);
  });

  test("an anonymous caller never sees raw upstream error text or per-provider detail", async () => {
    const secret = "token-abc123-internal-llm-10-0-0-7";
    const leaky = "__health_leaky_provider__";
    registerProvider(leaky, {
      capabilities: { type: "openai-compatible", label: "Internal Mesh", },
      healthCheck: () => Promise.reject(new Error(`fetch failed for http://internal-llm:8080/v1 ${secret}`,),),
      listModels: () => Promise.resolve([],),
    } as unknown as LLMProvider,);

    try {
      await scanAllProviders();

      const app = healthRoutes({} as never,);
      const res = await app.handle(new Request("http://localhost/api/health",),);
      const raw = await res.text();
      const body = JSON.parse(raw,) as { status: string; providers: Record<string, unknown>[] };

      expect(raw,).not.toContain(secret,);
      expect(raw,).not.toContain("internal-llm",);
      expect(body.status,).toBe("degraded",);
      for (const provider of body.providers) {
        expect(Object.keys(provider,).sort(),).toEqual(["name", "status",],);
      }
    } finally {
      unregisterProvider(leaky,);
      resetHealthCache();
    }
  });

  test("Content-Type is application/json", async () => {
    const app = healthRoutes({} as never,);
    const res = await app.handle(new Request("http://localhost/api/health",),);
    expect(res.headers.get("content-type",),).toStartWith("application/json",);
  });
},);
