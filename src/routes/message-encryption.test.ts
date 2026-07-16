/**
 * Unit tests for message-encryption routes (Elysia plugin)
 */
import { describe, test, expect } from "bun:test";
import { messageEncryptionRoutes } from "./message-encryption";

const mockDb = {} as any;
const mockConfig = {} as any;

describe("messageEncryptionRoutes", () => {
  test("exports function", () => {
    expect(typeof messageEncryptionRoutes).toBe("function");
  });

  test("returns Elysia plugin", () => {
    const plugin = messageEncryptionRoutes({ database: mockDb, config: mockConfig });
    expect(plugin).toBeDefined();
  });
});
