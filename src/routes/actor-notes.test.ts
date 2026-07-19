/**
 * Unit tests for actor-notes routes (Elysia plugin)
 */
import { describe, expect, test } from "bun:test";
import { actorNotesRoutes } from "./actor-notes";

const mockDb = {} as any;
const mockConfig = {} as any;

describe("actorNotesRoutes", () => {
  test("exports function", () => {
    expect(typeof actorNotesRoutes).toBe("function");
  });

  test("returns Elysia plugin", () => {
    const plugin = actorNotesRoutes({ database: mockDb, config: mockConfig });
    expect(plugin).toBeDefined();
  });
});
