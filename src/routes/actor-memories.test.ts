/**
 * Unit tests for actor-memories routes (Elysia plugin)
 */
import { describe, expect, test } from "bun:test";
import { actorMemoriesRoutes } from "./actor-memories";

const mockDb = {} as any;
const mockConfig = {} as any;

describe("actorMemoriesRoutes", () => {
  test("exports function", () => {
    expect(typeof actorMemoriesRoutes).toBe("function");
  });

  test("returns Elysia plugin", () => {
    const plugin = actorMemoriesRoutes({ database: mockDb, config: mockConfig });
    expect(plugin).toBeDefined();
  });
});
