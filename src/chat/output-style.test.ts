// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import {
  buildStyleDirective,
  clampIntensity,
  PRESET_DIRECTIVES,
  resolveOutputStyle,
} from "./output-style";
import type { OutputStyleGmConfig, } from "./output-style";

describe("resolveOutputStyle", () => {
  test("returns null when nothing configured", () => {
    expect(resolveOutputStyle(null, null, null, null,),).toBeNull();
  });

  test("chat column wins over user/server", () => {
    const r = resolveOutputStyle("noir", null, "sci_fi", "modern",);
    expect(r,).toEqual({ preset: "noir", intensity: 0.5, },);
  });

  test("gm_config.outputStyle preset wins over user/server", () => {
    const gm: OutputStyleGmConfig = { preset: "cyberpunk", intensity: 0.9, };
    const r = resolveOutputStyle(null, gm, "sci_fi", "modern",);
    expect(r,).toEqual({ preset: "cyberpunk", intensity: 0.9, },);
  });

  test("user preset applies when chat unset", () => {
    const r = resolveOutputStyle(null, null, "horror", "modern",);
    expect(r?.preset,).toBe("horror",);
  });

  test("server default applies last", () => {
    const r = resolveOutputStyle(null, null, null, "western",);
    expect(r?.preset,).toBe("western",);
  });

  test("customInstruction carried from gm_config", () => {
    const gm: OutputStyleGmConfig = { preset: "literary", customInstruction: "use semicolons sparingly", };
    const r = resolveOutputStyle(null, gm, null, null,);
    expect(r?.customInstruction,).toBe("use semicolons sparingly",);
  });

  test("intensity defaults to 0.5 and clamps", () => {
    expect(clampIntensity(undefined,),).toBe(0.5,);
    expect(clampIntensity(2,),).toBe(1,);
    expect(clampIntensity(-1,),).toBe(0,);
    expect(clampIntensity(Number.NaN,),).toBe(0.5,);
  });
});

describe("buildStyleDirective", () => {
  test("includes preset directive + intensity label", () => {
    const d = buildStyleDirective({ preset: "high_fantasy", intensity: 0.9, },);
    expect(d,).toContain(PRESET_DIRECTIVES.high_fantasy,);
    expect(d,).toContain("Strongly",);
  });

  test("subtle intensity label at low intensity", () => {
    const d = buildStyleDirective({ preset: "noir", intensity: 0.1, },);
    expect(d,).toContain("Subtly",);
  });

  test("appends customInstruction", () => {
    const d = buildStyleDirective({ preset: "modern", intensity: 0.5, customInstruction: "keep it snappy", },);
    expect(d,).toContain("keep it snappy",);
  });
});
