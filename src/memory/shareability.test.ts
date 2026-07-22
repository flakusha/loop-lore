/**
 * Shareability unit tests.
 */
import { describe, expect, test, } from "bun:test";
import {
  evaluateShareability,
  isMemoryVisible,
  parseShareability,
} from "./shareability";

// ─── isMemoryVisible ──────────────────────────────────────────

describe("isMemoryVisible", () => {
  test("public memory is visible to everyone", () => {
    expect(isMemoryVisible("public", "owner-1", "viewer-1",),).toBe(true,);
    expect(isMemoryVisible("public", "owner-1", "stranger",),).toBe(true,);
  });

  test("shared memory is visible to non-owner", () => {
    expect(isMemoryVisible("shared", "owner-1", "viewer-1",),).toBe(true,);
    expect(isMemoryVisible("shared", "owner-1", "stranger",),).toBe(true,);
  });

  test("private memory is visible only to owner", () => {
    expect(isMemoryVisible("private", "owner-1", "owner-1",),).toBe(true,);
    expect(isMemoryVisible("private", "owner-1", "viewer-1",),).toBe(false,);
  });

  test("secret memory is visible to owner and trusted actors", () => {
    expect(isMemoryVisible("secret", "owner-1", "owner-1",),).toBe(true,);
    expect(isMemoryVisible("secret", "owner-1", "trusted-1", ["trusted-1",],),).toBe(true,);
    expect(isMemoryVisible("secret", "owner-1", "stranger", ["trusted-1",],),).toBe(false,);
  });

  test("secret memory with empty trusted list is owner-only", () => {
    expect(isMemoryVisible("secret", "owner-1", "owner-1", [],),).toBe(true,);
    expect(isMemoryVisible("secret", "owner-1", "stranger", [],),).toBe(false,);
  });
});

// ─── parseShareability ────────────────────────────────────────

describe("parseShareability", () => {
  test("returns defaults for null", () => {
    const config = parseShareability(null,);
    expect(config.shareProbability,).toBe(0.5,);
    expect(config.trustedActorIds,).toEqual([],);
    expect(config.blockedActorIds,).toEqual([],);
  });

  test("parses valid JSON", () => {
    const json = JSON.stringify({
      shareProbability: 0.8,
      trustedActorIds: ["a", "b",],
      blockedActorIds: ["c",],
    },);
    const config = parseShareability(json,);
    expect(config.shareProbability,).toBeCloseTo(0.8,);
    expect(config.trustedActorIds,).toEqual(["a", "b",],);
    expect(config.blockedActorIds,).toEqual(["c",],);
  });

  test("handles invalid JSON gracefully", () => {
    const config = parseShareability("not json",);
    expect(config.shareProbability,).toBe(0.5,);
    expect(config.trustedActorIds,).toEqual([],);
  });

  test("clamps probability to 0-1", () => {
    const config = parseShareability(JSON.stringify({ shareProbability: 1.5, },),);
    expect(config.shareProbability,).toBe(1,);

    const config2 = parseShareability(JSON.stringify({ shareProbability: -0.5, },),);
    expect(config2.shareProbability,).toBe(0,);
  });
});

// ─── evaluateShareability ─────────────────────────────────────

describe("evaluateShareability", () => {
  const baseConfig = {
    shareProbability: 0.5,
    trustedActorIds: ["trusted-1",],
    blockedActorIds: ["blocked-1",],
  };

  test("blocked actor is always withheld", () => {
    const result = evaluateShareability({
      privacy: "shared",
      ownerId: "owner-1",
      viewerId: "blocked-1",
      shareability: baseConfig,
    },);
    expect(result,).toBe("withhold",);
  });

  test("trusted actor always shares", () => {
    const result = evaluateShareability({
      privacy: "secret",
      ownerId: "owner-1",
      viewerId: "trusted-1",
      shareability: baseConfig,
    },);
    expect(result,).toBe("share",);
  });

  test("private memory withheld from non-owner", () => {
    const result = evaluateShareability({
      privacy: "private",
      ownerId: "owner-1",
      viewerId: "stranger",
      shareability: baseConfig,
    },);
    expect(result,).toBe("withhold",);
  });

  test("private memory shared with owner", () => {
    const result = evaluateShareability({
      privacy: "private",
      ownerId: "owner-1",
      viewerId: "owner-1",
      shareability: baseConfig,
    },);
    expect(result,).toBe("share",);
  });

  test("probability check respects randomFn", () => {
    // roll = 0.3, threshold = 0.5 → share
    const share = evaluateShareability({
      privacy: "shared",
      ownerId: "owner-1",
      viewerId: "viewer-1",
      shareability: { ...baseConfig, shareProbability: 0.5, },
      randomFn: () => 0.3,
    },);
    expect(share,).toBe("share",);

    // roll = 0.7, threshold = 0.5 → withhold
    const withhold = evaluateShareability({
      privacy: "shared",
      ownerId: "owner-1",
      viewerId: "viewer-1",
      shareability: { ...baseConfig, shareProbability: 0.5, },
      randomFn: () => 0.7,
    },);
    expect(withhold,).toBe("withhold",);
  });

  test("trust modifier shifts probability", () => {
    // base 0.3 + modifier 0.4 = 0.7 → roll 0.5 should share
    const result = evaluateShareability({
      privacy: "shared",
      ownerId: "owner-1",
      viewerId: "viewer-1",
      shareability: { ...baseConfig, shareProbability: 0.3, },
      trustModifier: 0.4,
      randomFn: () => 0.5,
    },);
    expect(result,).toBe("share",);

    // base 0.3 + modifier -0.4 = -0.1 → clamped to 0 → always withhold
    const result2 = evaluateShareability({
      privacy: "shared",
      ownerId: "owner-1",
      viewerId: "viewer-1",
      shareability: { ...baseConfig, shareProbability: 0.3, },
      trustModifier: -0.4,
      randomFn: () => 0.01,
    },);
    expect(result2,).toBe("withhold",);
  });

  test("secret memory with trusted actor shares regardless of probability", () => {
    const result = evaluateShareability({
      privacy: "secret",
      ownerId: "owner-1",
      viewerId: "trusted-1",
      shareability: { ...baseConfig, shareProbability: 0, },
    },);
    expect(result,).toBe("share",);
  });
});
