import { describe, expect, it, } from "bun:test";
import { statusRoutes, } from "./status";

describe("export-sse/status (0%)", () => {
  it("statusRoutes creates Elysia instance", () => {
    const app = statusRoutes({ database: {} as any, },);
    expect(app,).toBeDefined();
    expect(typeof (app as any).get,).toBe("function",);
  });
});
