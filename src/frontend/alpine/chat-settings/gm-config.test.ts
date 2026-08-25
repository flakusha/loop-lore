// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import type { GmConfig, } from "../types";
import { buildGmConfig, readGmSettings, } from "./gm-config";

describe("gm-config output style", () => {
  test("readGmSettings defaults to no preset when unset", () => {
    const fields = readGmSettings({},);
    expect(fields.outputStylePreset,).toBe("",);
    expect(fields.outputStyleIntensity,).toBe(0.5,);
  });

  test("readGmSettings reads persisted preset + intensity", () => {
    const config = { outputStyle: { preset: "noir", intensity: 0.8, }, } as GmConfig;
    const fields = readGmSettings(config,);
    expect(fields.outputStylePreset,).toBe("noir",);
    expect(fields.outputStyleIntensity,).toBe(0.8,);
  });

  test("buildGmConfig writes outputStyle when a preset is selected", () => {
    const fields = {
      ...readGmSettings({},),
      outputStylePreset: "cyberpunk" as const,
      outputStyleIntensity: 0.9,
    };
    const gm = buildGmConfig({}, fields, {},);
    expect(gm.outputStyle,).toEqual({ preset: "cyberpunk", intensity: 0.9, },);
  });

  test("buildGmConfig deletes outputStyle when preset cleared", () => {
    const existing = { outputStyle: { preset: "noir", intensity: 0.5, }, } as GmConfig;
    const gm = buildGmConfig(existing, readGmSettings({},), {},);
    expect("outputStyle" in gm,).toBe(false,);
  });

  test("round-trip preserves sibling gm_config keys", () => {
    const existing = {
      storyMode: true,
      assistantRole: "gm",
      outputStyle: { preset: "horror", intensity: 1, },
    } as unknown as GmConfig;
    const fields = readGmSettings(existing,);
    const gm = buildGmConfig(existing, fields, {},);
    expect(gm.storyMode,).toBe(true,);
    expect(gm.assistantRole,).toBe("gm",);
    expect(gm.outputStyle,).toEqual({ preset: "horror", intensity: 1, },);
  });
});
