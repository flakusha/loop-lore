/**
 * Unit tests for messages routes (Elysia plugin)
 */
import { describe, test, expect } from "bun:test";
import { messagesRoutes } from "./messages";

const mockDb = {} as any;
const mockConfig = {} as any;

describe("messagesRoutes", () => {
  test("exports function", () => {
    expect(typeof messagesRoutes).toBe("function");
  });

  test("returns Elysia plugin", () => {
    const plugin = messagesRoutes({ database: mockDb, config: mockConfig });
    expect(plugin).toBeDefined();
  });
});
