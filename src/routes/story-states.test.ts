/**
 * Unit tests for story-states routes (Elysia plugin)
 */
import { describe, expect, test, } from "bun:test";
import { storyStatesRoutes, } from "./story-states";

const mockDb = {} as any;

describe("storyStatesRoutes", () => {
  test("exports function", () => {
    expect(typeof storyStatesRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const plugin = storyStatesRoutes({ database: mockDb, },);
    expect(plugin,).toBeDefined();
  });
});
