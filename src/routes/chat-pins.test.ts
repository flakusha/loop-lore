import { describe, expect, test, } from "bun:test";

describe("chat-pins", () => {
  test("exports function", () => {
    const mod = require("./chat-pins",);
    expect(typeof mod.chatPinRoutes,).toBe("function",);
  });
});
