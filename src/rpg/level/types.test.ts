import { describe, expect, it, } from "bun:test";
import { DEFAULT_HIT_DIE, ENSURED_STATS_DEFAULTS, LevelServiceError, XP_TO_NEXT_MAX_SENTINEL, } from "./types.js";

describe("level/types constants", () => {
  it("the hit-die baseline is a usable d8", () => {
    expect(DEFAULT_HIT_DIE,).toBe(8,);
  });

  it("ensured stats defaults give a playable baseline row", () => {
    expect(ENSURED_STATS_DEFAULTS,).toEqual({ hp: 10, maxHp: 10, ac: 10, },);
  });

  it("the max-level sentinel is negative so it can never read as real XP-to-next", () => {
    expect(XP_TO_NEXT_MAX_SENTINEL,).toBe(-1,);
  });

  it("LevelServiceError carries its code", () => {
    const err = new LevelServiceError("bad", "invalid_amount",);
    expect(err.code,).toBe("invalid_amount",);
    expect(err.name,).toBe("LevelServiceError",);
  });
});
