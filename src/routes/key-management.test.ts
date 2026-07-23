/**
 * Key Management Routes Tests
 */

import { describe, expect, it, } from "bun:test";
import { Elysia, } from "elysia";
import { keyManagementRoutes, } from "./key-management";

describe("keyManagementRoutes", () => {
  it("exports a function that returns an Elysia instance", () => {
    const mockDb = {} as any;
    const result = keyManagementRoutes({ database: mockDb, },);
    expect(result,).toBeInstanceOf(Elysia,);
  });
});
