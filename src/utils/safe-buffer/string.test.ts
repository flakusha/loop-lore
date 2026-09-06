import { describe, expect, it, } from "bun:test";
import { safeFromString, } from "./string";

describe("safe-buffer/string (real logic)", () => {
  it("returns ok for valid string", () => {
    const r = safeFromString("hello",);
    expect(r.ok,).toBe(true,);
    if (r.ok) { expect(r.buffer.toString(),).toBe("hello",); }
  });
  it("returns error when string exceeds size", () => {
    const r = safeFromString("x".repeat(100,), "utf8", 10,);
    expect(r.ok,).toBe(false,);
    if (!r.ok) { expect(r.error.message,).toContain("too large",); }
  });
});
