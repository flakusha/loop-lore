import { describe, expect, test, } from "bun:test";
import { chatExportRoutes, } from "./chat-export/index";

describe("chat-export", () => {
  test("exports function", () => {
    expect(typeof chatExportRoutes,).toBe("function",);
  });
});
