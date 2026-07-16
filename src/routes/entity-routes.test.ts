/**
 * Unit tests for entity-routes (Elysia plugin factory)
 */
import { describe, test, expect } from "bun:test";
import { createEntityRoutes } from "./entity-routes";

const mockDb = {} as any;
const mockConfig = {} as any;
const mockEntityConfig = { types: [] } as any;

describe("createEntityRoutes", () => {
  test("exports function", () => {
    expect(typeof createEntityRoutes).toBe("function");
  });

  test("returns Elysia plugin", () => {
    const plugin = createEntityRoutes(mockEntityConfig, { database: mockDb, config: mockConfig });
    expect(plugin).toBeDefined();
  });
});
