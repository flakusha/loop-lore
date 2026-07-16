/**
 * Unit tests for world-lore-entries routes (Elysia plugin)
 */
import { describe, test, expect } from "bun:test";
import { worldLoreEntriesRoutes } from "./world-lore-entries";

const mockDb = {} as any;
const mockConfig = {} as any;

describe("worldLoreEntriesRoutes", () => {
  test("exports function", () => {
    expect(typeof worldLoreEntriesRoutes).toBe("function");
  });

  test("returns Elysia plugin", () => {
    const plugin = worldLoreEntriesRoutes({ database: mockDb, config: mockConfig });
    expect(plugin).toBeDefined();
  });
});
