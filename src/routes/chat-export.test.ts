import { describe, expect, test, } from "bun:test";

describe("chat-export", () => {
  test("exports function", () => {
    // Verify the module can be imported
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Bun test pattern for module verification
    const mod = require("./chat-export",);
    expect(typeof mod.chatExportRoutes,).toBe("function",);
  });
});
