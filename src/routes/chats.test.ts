/**
 * Unit tests for chats routes (Elysia plugin)
 */
import { describe, test, expect } from "bun:test";
import { chatsRoutes } from "./chats";

const mockDb = {} as any;

describe("chatsRoutes", () => {
  test("exports function", () => {
    expect(typeof chatsRoutes).toBe("function");
  });

  test("returns Elysia plugin", () => {
    const plugin = chatsRoutes({ database: mockDb });
    expect(plugin).toBeDefined();
  });
});
