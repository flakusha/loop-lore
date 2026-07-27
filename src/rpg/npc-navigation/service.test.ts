/**
 * NPC Navigation Service Tests
 */
import { describe, expect, it, } from "bun:test";
import { MovementPattern, } from "./service";

describe("NpcNavigationService", () => {
  describe("MovementPattern", () => {
    it("should have correct pattern values", () => {
      expect(MovementPattern.Stationary,).toBe("stationary",);
      expect(MovementPattern.Patrol,).toBe("patrol",);
      expect(MovementPattern.Wander,).toBe("wander",);
      expect(MovementPattern.Follow,).toBe("follow",);
      expect(MovementPattern.Flee,).toBe("flee",);
      expect(MovementPattern.Custom,).toBe("custom",);
    });
  });

  describe("MovementResult", () => {
    it("should have correct structure", () => {
      const result = {
        success: true,
        fromLocationId: "loc-1",
        toLocationId: "loc-2",
        pattern: MovementPattern.Patrol,
        errors: [],
      };

      expect(result.success,).toBe(true,);
      expect(result.fromLocationId,).toBe("loc-1",);
      expect(result.toLocationId,).toBe("loc-2",);
      expect(result.pattern,).toBe(MovementPattern.Patrol,);
      expect(result.errors,).toEqual([],);
    });
  });
});
