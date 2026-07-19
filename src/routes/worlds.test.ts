/**
 * Unit tests for worlds routes (Elysia plugin)
 */
import { describe, expect, test } from "bun:test";
import { worldsRoutes } from "./worlds";

const mockDb = {} as any;
const mockConfig = {} as any;

describe("worldsRoutes", () => {
  test("exports function", () => {
    expect(typeof worldsRoutes).toBe("function");
  });

  test("returns Elysia plugin", () => {
    const plugin = worldsRoutes({ database: mockDb, config: mockConfig });
    expect(plugin).toBeDefined();
  });
});
