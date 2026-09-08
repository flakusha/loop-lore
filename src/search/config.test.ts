import { describe, expect, it, } from "bun:test";
import { DEFAULT_GLOBAL_CAP, resolveTimeCap, } from "./config";

describe("search/config (3-tier precedence)", () => {
  it("falls back to builtin when global is empty", () => {
    expect(resolveTimeCap({ global: {}, },),).toEqual({
      defaultMs: DEFAULT_GLOBAL_CAP.defaultMs,
      maxMs: DEFAULT_GLOBAL_CAP.maxMs,
    },);
  });
  it("global values win over builtin", () => {
    expect(resolveTimeCap({ global: { defaultMs: 100, maxMs: 400, }, },),).toEqual({
      defaultMs: 100,
      maxMs: 400,
    },);
  });
  it("admin overrides global", () => {
    expect(
      resolveTimeCap({ global: { defaultMs: 100, maxMs: 400, }, admin: { maxMs: 900, }, },),
    ).toEqual({ defaultMs: 100, maxMs: 900, },);
  });
  it("user overrides admin and global per-field", () => {
    expect(
      resolveTimeCap({
        global: { defaultMs: 100, maxMs: 400, },
        admin: { defaultMs: 200, maxMs: 900, },
        user: { defaultMs: 50, },
      },),
    ).toEqual({ defaultMs: 50, maxMs: 900, },);
  });
});
