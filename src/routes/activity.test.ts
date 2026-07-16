/**
 * Unit tests for activity routes (Elysia plugin)
 */
import { describe, test, expect } from "bun:test";
import { activityRoutes } from "./activity";

const mockDb = {} as any;

describe("activityRoutes", () => {
  test("exports function", () => {
    expect(typeof activityRoutes).toBe("function");
  });

  test("returns Elysia plugin", () => {
    const plugin = activityRoutes({ database: mockDb });
    expect(plugin).toBeDefined();
  });
});
