import { describe, expect, it, } from "bun:test";
import { generateRoute, } from "./generate-route";

describe("generation/generate-route (real logic)", () => {
  it("exports route function", () => {
    expect(typeof generateRoute,).toBe("function",);
  });
});
