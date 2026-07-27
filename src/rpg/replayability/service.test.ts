/**
 * Replayability Service Tests
 */
import { describe, expect, it, } from "bun:test";
import { EndingType, PlusDifficulty, } from "./service";

describe("ReplayabilityService", () => {
  describe("PlusDifficulty", () => {
    it("should have correct difficulty values", () => {
      expect(PlusDifficulty.Normal,).toBe("normal",);
      expect(PlusDifficulty.Hard,).toBe("hard",);
      expect(PlusDifficulty.Nightmare,).toBe("nightmare",);
      expect(PlusDifficulty.Custom,).toBe("custom",);
    });
  });

  describe("EndingType", () => {
    it("should have correct ending type values", () => {
      expect(EndingType.Good,).toBe("good",);
      expect(EndingType.Neutral,).toBe("neutral",);
      expect(EndingType.Bad,).toBe("bad",);
      expect(EndingType.Secret,).toBe("secret",);
      expect(EndingType.True,).toBe("true",);
    });
  });
});
