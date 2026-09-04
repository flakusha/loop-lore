// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import type { GmConfig, } from "../types";
import { buildGmConfig, presentationGmConfig, readGmSettings, } from "./gm-config";

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

  test("readGmSettings defaults the five VN fields to renderer DEFAULTS", () => {
    const fields = readGmSettings({},);
    expect(fields.imageScaling,).toBe("auto",);
    expect(fields.autoAdvanceDelay,).toBe(5,);
    expect(fields.dialogueBoxOpacity,).toBe(0.75,);
    expect(fields.portraitSize,).toBe(35,);
    expect(fields.splitRatio,).toBe(40,);
  });

  test("readGmSettings reads persisted vn-prefixed VN fields", () => {
    const config = {
      vnImageScaling: "cover",
      vnAutoAdvanceDelay: 12,
      vnDialogueBoxOpacity: 0.5,
      vnPortraitSize: 60,
      vnSplitRatio: 55,
    } as GmConfig;
    const fields = readGmSettings(config,);
    expect(fields.imageScaling,).toBe("cover",);
    expect(fields.autoAdvanceDelay,).toBe(12,);
    expect(fields.dialogueBoxOpacity,).toBe(0.5,);
    expect(fields.portraitSize,).toBe(60,);
    expect(fields.splitRatio,).toBe(55,);
  });

  test("buildGmConfig emits vn-prefixed VN keys", () => {
    const fields = { ...readGmSettings({},), imageScaling: "fill" as const, splitRatio: 45, };
    const gm = buildGmConfig({}, fields, {},);
    expect(gm.vnImageScaling,).toBe("fill",);
    expect(gm.vnAutoAdvanceDelay,).toBe(5,);
    expect(gm.vnDialogueBoxOpacity,).toBe(0.75,);
    expect(gm.vnPortraitSize,).toBe(35,);
    expect(gm.vnSplitRatio,).toBe(45,);
  });

  test("presentationGmConfig keeps presentation keys and drops GM-execution keys", () => {
    const full = {
      assistantRole: "gm",
      type: "hybrid",
      humanGM: { actorId: "a", notifications: true, },
      renderingOverride: "visual_novel",
      vnLayout: "below",
      vnSplitRatio: 40,
    };
    const subset = presentationGmConfig(full,);
    expect(subset.renderingOverride,).toBe("visual_novel",);
    expect(subset.vnLayout,).toBe("below",);
    expect(subset.vnSplitRatio,).toBe(40,);
    expect("assistantRole" in subset,).toBe(false,);
    expect("type" in subset,).toBe(false,);
    expect("humanGM" in subset,).toBe(false,);
  });
});
