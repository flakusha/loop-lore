import { describe, expect, it, } from "bun:test";
import { safeJsonParse, safeJsonStringify, } from "./safe-json";

describe("utils/safe-json (real logic)", () => {
  it("safeJsonParse parses valid JSON", () => {
    const r = safeJsonParse('{"a":1}',);
    expect(r.ok,).toBe(true,);
    if (r.ok) { expect(r.value,).toEqual({ a: 1, },); }
  });
  it("safeJsonParse fails on invalid JSON", () => {
    const r = safeJsonParse("{bad",);
    expect(r.ok,).toBe(false,);
    if (!r.ok) { expect(r.error,).toBeInstanceOf(Error,); }
  });
  it("safeJsonStringify serializes object", () => {
    const r = safeJsonStringify({ x: 42, },);
    expect(r.ok,).toBe(true,);
    if (r.ok) { expect(r.value,).toBe('{"x":42}',); }
  });
  it("safeJsonStringify fails on circular", () => {
    const a: any = { b: 1, };
    a.self = a;
    const r = safeJsonStringify(a,);
    expect(r.ok,).toBe(false,);
  });
});
