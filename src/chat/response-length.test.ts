// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import {
  buildLengthConfig,
  computeMaxTokens,
  DEFAULT_RESPONSE_LENGTH,
  isValidPreset,
  LENGTH_PRESETS,
  parseLengthConfig,
} from "./response-length";

describe("computeMaxTokens", () => {
  it("returns the preset max for short/medium/long", () => {
    expect(computeMaxTokens("short",),).toBe(150,);
    expect(computeMaxTokens("medium",),).toBe(400,);
    expect(computeMaxTokens("long",),).toBe(1000,);
  });

  it("returns the custom value for the custom preset", () => {
    expect(computeMaxTokens("custom", 750,),).toBe(750,);
  });

  it("falls back to medium max when custom has no value", () => {
    expect(computeMaxTokens("custom",),).toBe(400,);
  });

  it("floors custom values at 1", () => {
    expect(computeMaxTokens("custom", 0,),).toBe(1,);
    expect(computeMaxTokens("custom", -10,),).toBe(1,);
  });
});

describe("buildLengthConfig", () => {
  it("builds a full config with computed maxTokens", () => {
    expect(buildLengthConfig("long",),).toEqual({
      preset: "long",
      customMin: undefined,
      customMax: undefined,
      maxTokens: 1000,
    },);
  });

  it("carries custom bounds through", () => {
    const config = buildLengthConfig("custom", 50, 750,);
    expect(config.customMin,).toBe(50,);
    expect(config.customMax,).toBe(750,);
    expect(config.maxTokens,).toBe(750,);
  });
});

describe("parseLengthConfig", () => {
  it("returns the default for null/undefined/empty settings", () => {
    expect(parseLengthConfig(null,),).toEqual(DEFAULT_RESPONSE_LENGTH,);
    expect(parseLengthConfig(undefined,),).toEqual(DEFAULT_RESPONSE_LENGTH,);
    expect(parseLengthConfig({},),).toEqual(DEFAULT_RESPONSE_LENGTH,);
  });

  it("parses a preset from settings JSON", () => {
    const config = parseLengthConfig({ responseLength: { preset: "long", }, },);
    expect(config.preset,).toBe("long",);
    expect(config.maxTokens,).toBe(1000,);
  });

  it("falls back to the default preset for invalid values", () => {
    const config = parseLengthConfig({ responseLength: { preset: "huge", }, },);
    expect(config.preset,).toBe(DEFAULT_RESPONSE_LENGTH.preset,);
  });

  it("passes custom bounds through", () => {
    const config = parseLengthConfig(
      { responseLength: { preset: "custom", customMin: 50, customMax: 750, }, },
    );
    expect(config.maxTokens,).toBe(750,);
  });
});

describe("isValidPreset", () => {
  it("accepts valid presets", () => {
    expect(isValidPreset("short",),).toBe(true,);
    expect(isValidPreset("medium",),).toBe(true,);
    expect(isValidPreset("long",),).toBe(true,);
    expect(isValidPreset("custom",),).toBe(true,);
  });

  it("rejects invalid presets", () => {
    expect(isValidPreset("tiny",),).toBe(false,);
    expect(isValidPreset("huge",),).toBe(false,);
    expect(isValidPreset("",),).toBe(false,);
  });
});

describe("LENGTH_PRESETS", () => {
  it("defines short/medium/long ranges", () => {
    expect(LENGTH_PRESETS.short,).toEqual({ label: "Short", min: 50, max: 150, },);
    expect(LENGTH_PRESETS.medium,).toEqual({ label: "Medium", min: 150, max: 400, },);
    expect(LENGTH_PRESETS.long,).toEqual({ label: "Long", min: 400, max: 1000, },);
  });
});

describe("DEFAULT_RESPONSE_LENGTH", () => {
  it("defaults to medium", () => {
    expect(DEFAULT_RESPONSE_LENGTH.preset,).toBe("medium",);
    expect(DEFAULT_RESPONSE_LENGTH.maxTokens,).toBe(400,);
  });
});
