import { describe, expect, it, } from "bun:test";
import { isNsfwRating, } from "./nsfw-gate";

describe("isNsfwRating", () => {
  it("returns true for NSFW ratings", () => {
    expect(isNsfwRating("nsfw_mild",),).toBe(true,);
    expect(isNsfwRating("nsfw_moderate",),).toBe(true,);
    expect(isNsfwRating("nsfw_intense",),).toBe(true,);
    expect(isNsfwRating("nsfw_extreme",),).toBe(true,);
  });

  it("returns false for SFW ratings", () => {
    expect(isNsfwRating("sfw",),).toBe(false,);
  });
});
