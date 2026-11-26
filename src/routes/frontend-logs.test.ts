/**
 * Unit tests for frontend-logs routes (Elysia plugin)
 */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { createLogger, } from "../logger";
import { createRateLimiter, } from "../middleware/rate-limit";
import { frontendLogsRoutes, MAX_FRONTEND_LOG_ENTRIES, } from "./frontend-logs";

describe("frontendLogsRoutes", () => {
  test("exports function", () => {
    expect(typeof frontendLogsRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const plugin = frontendLogsRoutes();
    expect(plugin,).toBeDefined();
  });

  test("rate-limits the anonymous sink and caps batch size", async () => {
    createLogger({ level: "error", },);
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1, },);
    try {
      const app = new Elysia({ name: "test-frontend-logs-limit", },)
        .use(frontendLogsRoutes("/api", { logRateLimiter: limiter, },),);

      const entry = { level: "info", module: "browser", message: "ok", timestamp: "now", };
      const post = (entries: unknown[],) =>
        new Request("http://localhost/api/frontend/logs", {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ entries, },),
        },);

      const first = await app.handle(post([entry,],),);
      expect(first.status,).toBe(200,);
      const second = await app.handle(post([entry,],),);
      expect(second.status,).toBe(429,);

      const oversized = Array.from({ length: MAX_FRONTEND_LOG_ENTRIES + 1, }, () => entry,);
      const tooBig = await app.handle(post(oversized,),);
      expect(tooBig.status,).toBe(400,);
    } finally {
      limiter.destroy();
    }
  });
});
