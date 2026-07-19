import { describe, expect, test, } from "bun:test";

describe("chat-pins", () => {
  test("exports function", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Bun test pattern for module verification
    const mod = require("./chat-pins",);
    expect(typeof mod.chatPinRoutes,).toBe("function",);
  });
});
