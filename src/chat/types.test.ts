import { describe, expect, it, } from "bun:test";
import { MODE_DEFAULTS, resolveFeatureFlags, RESPONSE_LENGTH_DEFAULTS, } from "./types";

describe("resolveFeatureFlags", () => {
  it("returns defaults for direct mode", () => {
    const flags = resolveFeatureFlags("direct",);
    expect(flags.contextWindow,).toBe(true,);
    expect(flags.turnOrchestration,).toBe(false,);
    expect(flags.visualNovel,).toBe(true,);
  });

  it("returns defaults for group mode", () => {
    const flags = resolveFeatureFlags("group",);
    expect(flags.turnOrchestration,).toBe(true,);
    expect(flags.visualNovel,).toBe(false,);
  });

  it("returns defaults for story mode", () => {
    const flags = resolveFeatureFlags("story",);
    expect(flags.turnOrchestration,).toBe(true,);
    expect(flags.visualNovel,).toBe(true,);
  });

  it("applies overrides", () => {
    const flags = resolveFeatureFlags("direct", { visualNovel: false, },);
    expect(flags.visualNovel,).toBe(false,);
    expect(flags.contextWindow,).toBe(true,); // default preserved
  });

  it("falls back to direct for unknown mode", () => {
    const flags = resolveFeatureFlags("unknown" as never,);
    expect(flags,).toEqual(MODE_DEFAULTS.direct,);
  });
});

describe("MODE_DEFAULTS", () => {
  it("has all three modes", () => {
    expect(MODE_DEFAULTS.direct,).toBeDefined();
    expect(MODE_DEFAULTS.group,).toBeDefined();
    expect(MODE_DEFAULTS.story,).toBeDefined();
  });

  it("direct mode has contextWindow enabled", () => {
    expect(MODE_DEFAULTS.direct.contextWindow,).toBe(true,);
  });

  it("group mode has turnOrchestration enabled", () => {
    expect(MODE_DEFAULTS.group.turnOrchestration,).toBe(true,);
  });
});

describe("RESPONSE_LENGTH_DEFAULTS", () => {
  it("has all presets", () => {
    expect(RESPONSE_LENGTH_DEFAULTS.short,).toBe(150,);
    expect(RESPONSE_LENGTH_DEFAULTS.medium,).toBe(500,);
    expect(RESPONSE_LENGTH_DEFAULTS.long,).toBe(1000,);
    expect(RESPONSE_LENGTH_DEFAULTS.custom,).toBe(500,);
  });
});
