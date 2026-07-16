/**
 * Unit tests for characters routes (Elysia plugin)
 */
import { describe, test, expect } from "bun:test";
import { charactersRoutes } from "./characters";

const mockDb = {} as any;

describe("charactersRoutes", () => {
  test("exports function", () => {
    expect(typeof charactersRoutes).toBe("function");
  });

  test("returns Elysia plugin", () => {
    const plugin = charactersRoutes({ database: mockDb });
    expect(plugin).toBeDefined();
  });
});
