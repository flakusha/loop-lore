/**
 * Unit tests for auth routes (Elysia plugin)
 */
import { describe, test, expect } from "bun:test";
import { authPublicRoutes } from "./auth";

const mockDb = {} as any;
const mockConfig = {} as any;

describe("authPublicRoutes", () => {
  test("exports function", () => {
    expect(typeof authPublicRoutes).toBe("function");
  });

  test("returns Elysia plugin", () => {
    const plugin = authPublicRoutes({ database: mockDb, config: mockConfig });
    expect(plugin).toBeDefined();
  });
});
