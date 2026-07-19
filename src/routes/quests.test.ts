/**
 * Unit tests for quests routes (Elysia plugin)
 */
import { describe, expect, test, } from "bun:test";
import { questsRoutes, } from "./quests";

const mockDb = {} as any;

describe("questsRoutes", () => {
  test("exports function", () => {
    expect(typeof questsRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const plugin = questsRoutes({ database: mockDb, },);
    expect(plugin,).toBeDefined();
  });
});
