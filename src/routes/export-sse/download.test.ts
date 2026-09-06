import { describe, expect, it, } from "bun:test";
import { downloadRoutes, } from "./download";

describe("export-sse/download (0%)", () => {
  it("downloadRoutes creates Elysia instance", () => {
    const app = downloadRoutes({ database: {} as any, },);
    expect(app,).toBeDefined();
    expect(typeof (app as any).get,).toBe("function",);
  });
});
