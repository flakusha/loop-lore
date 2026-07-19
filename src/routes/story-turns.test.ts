/**
 * Unit tests for story-turns routes (Elysia plugin)
 */
import { describe, expect, test } from "bun:test";
import { storyTurnsRoutes } from "./story-turns";

const mockDb = {} as any;
const mockConfig = {} as any;

describe("storyTurnsRoutes", () => {
  test("exports function", () => {
    expect(typeof storyTurnsRoutes).toBe("function");
  });

  test("returns Elysia plugin", () => {
    const plugin = storyTurnsRoutes({ database: mockDb, config: mockConfig });
    expect(plugin).toBeDefined();
  });
});
