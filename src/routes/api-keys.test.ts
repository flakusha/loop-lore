/**
 * Unit tests for api-keys routes (Elysia plugin)
 */
import { describe, expect, test } from "bun:test";
import { apiKeysRoutes } from "./api-keys";

const mockDb = {} as any;

describe("apiKeysRoutes", () => {
  test("exports function", () => {
    expect(typeof apiKeysRoutes).toBe("function");
  });

  test("returns Elysia plugin", () => {
    const plugin = apiKeysRoutes({ database: mockDb, config: {} as any });
    expect(plugin).toBeDefined();
  });
});
