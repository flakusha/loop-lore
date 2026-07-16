/**
 * Unit tests for users routes (Elysia plugin)
 */
import { describe, test, expect } from "bun:test";
import { usersRoutes } from "./users";

const mockDb = {} as any;

describe("usersRoutes", () => {
  test("exports function", () => {
    expect(typeof usersRoutes).toBe("function");
  });

  test("returns Elysia plugin", () => {
    const plugin = usersRoutes({ database: mockDb, config: {} as any });
    expect(plugin).toBeDefined();
  });
});
