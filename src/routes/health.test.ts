/**
 * Tests for health routes.
 *
 * healthRoutes returns an Elysia plugin. We test via its .handle() method
 * (the standard fetch handler). No DB or I/O needed — the handler reads
 * from the global provider health cache.
 */
import { describe, expect, test } from "bun:test";
import { healthRoutes } from "./health";

describe("healthRoutes", () => {
  test("GET /api/health returns 200", async () => {
    const app = healthRoutes({} as never);
    const res = await app.handle(new Request("http://localhost/api/health"));
    expect(res.status).toBe(200);
  });

  test("returns JSON with status, uptime, timestamp, providers", async () => {
    const app = healthRoutes({} as never);
    const res = await app.handle(new Request("http://localhost/api/health"));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("uptime");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("providers");
    expect(Array.isArray(body.providers)).toBe(true);
  });

  test("status is 'ok' when no providers are unhealthy", async () => {
    const app = healthRoutes({} as never);
    const res = await app.handle(new Request("http://localhost/api/health"));
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  test("uptime is a non-negative integer", async () => {
    const app = healthRoutes({} as never);
    const res = await app.handle(new Request("http://localhost/api/health"));
    const body = (await res.json()) as { uptime: number };
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(body.uptime)).toBe(true);
  });

  test("timestamp is a valid ISO 8601 string", async () => {
    const app = healthRoutes({} as never);
    const res = await app.handle(new Request("http://localhost/api/health"));
    const body = (await res.json()) as { timestamp: string };
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  test("providers is an array (may be empty)", async () => {
    const app = healthRoutes({} as never);
    const res = await app.handle(new Request("http://localhost/api/health"));
    const body = (await res.json()) as { providers: unknown[] };
    expect(Array.isArray(body.providers)).toBe(true);
  });

  test("unknown route returns 404 from Elysia", async () => {
    const app = healthRoutes({} as never);
    const res = await app.handle(new Request("http://localhost/api/unknown"));
    expect(res.status).toBe(404);
  });

  test("wrong method returns 404", async () => {
    const app = healthRoutes({} as never);
    const res = await app.handle(new Request("http://localhost/api/health", { method: "POST" }));
    expect(res.status).toBe(404);
  });

  test("Content-Type is application/json", async () => {
    const app = healthRoutes({} as never);
    const res = await app.handle(new Request("http://localhost/api/health"));
    expect(res.headers.get("content-type")).toStartWith("application/json");
  });
});
