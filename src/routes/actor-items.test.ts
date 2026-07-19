/**
 * Unit tests for actor-items routes (Elysia plugin)
 */
import { describe, expect, test, } from "bun:test";
import { actorItemsRoutes, } from "./actor-items";

const mockDb = {} as any;
const mockConfig = {} as any;

describe("actorItemsRoutes", () => {
  test("exports function", () => {
    expect(typeof actorItemsRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const plugin = actorItemsRoutes({ database: mockDb, config: mockConfig, },);
    expect(plugin,).toBeDefined();
  });
});
