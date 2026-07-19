import { describe, expect, test, } from "bun:test";

describe("chat-export", () => {
  test("exports function", () => {
    // Verify the module can be imported

    const mod = require("./chat-export",);
    expect(typeof mod.chatExportRoutes,).toBe("function",);
  });
});
