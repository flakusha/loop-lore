/**
 * Unit tests for actor-lore-entries routes (Elysia plugin)
 */
import { describe, expect, test } from "bun:test";
import { actorLoreEntriesRoutes } from "./actor-lore-entries";

const mockDb = {} as any;
const mockConfig = {} as any;

describe("actorLoreEntriesRoutes", () => {
  test("exports function", () => {
    expect(typeof actorLoreEntriesRoutes).toBe("function");
  });

  test("returns Elysia plugin", () => {
    const plugin = actorLoreEntriesRoutes({ database: mockDb, config: mockConfig });
    expect(plugin).toBeDefined();
  });
});
