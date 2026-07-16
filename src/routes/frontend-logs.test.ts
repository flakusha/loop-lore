/**
 * Unit tests for frontend-logs routes (Elysia plugin)
 */
import { describe, test, expect } from "bun:test";
import { frontendLogsRoutes } from "./frontend-logs";

describe("frontendLogsRoutes", () => {
  test("exports function", () => {
    expect(typeof frontendLogsRoutes).toBe("function");
  });

  test("returns Elysia plugin", () => {
    const plugin = frontendLogsRoutes();
    expect(plugin).toBeDefined();
  });
});
