/**
 * Unit tests for story-items routes (Elysia plugin)
 */
import { describe, expect, test } from "bun:test";
import { storyItemsRoutes } from "./story-items";

const mockDb = {} as any;

describe("storyItemsRoutes", () => {
  test("exports function", () => {
    expect(typeof storyItemsRoutes).toBe("function");
  });

  test("returns Elysia plugin", () => {
    const plugin = storyItemsRoutes({ database: mockDb });
    expect(plugin).toBeDefined();
  });
});
