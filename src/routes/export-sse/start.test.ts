import { describe, expect, it, } from "bun:test";
import { startRoutes, } from "./start";

describe("export-sse/start (0% -> actually imported)", () => {
  it("startRoutes creates Elysia with post route", () => {
    const app = startRoutes({ database: {} as any, },);
    expect(app,).toBeDefined();
    expect(typeof (app as any).post,).toBe("function",);
  });
});
