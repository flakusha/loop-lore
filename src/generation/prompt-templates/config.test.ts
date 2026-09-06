/**
 * Prompt Template Config Tests
 *
 * Pins config-profile conversion and registry merge precedence.
 */
import { describe, expect, it, } from "bun:test";
import { type SdProfileOverride, type SdTemplateConfig, } from "../../config/sections/templates.js";
import { configProfileToImageModelProfile, createConfigRegistry, } from "./config.js";

const OVERRIDE: SdProfileOverride = {
  id: "custom",
  name: "Custom",
  families: ["sd15",],
  promptFormat: "standard",
  maxTokenHint: 75,
  defaults: { cfgScale: 7, steps: 20, sampler: "euler", },
  templates: { balanced: { scene: "a scene", }, },
} as SdProfileOverride;

describe("configProfileToImageModelProfile", () => {
  it("fills missing template fields with empty strings", () => {
    const p = configProfileToImageModelProfile(OVERRIDE,);
    expect(p.id,).toBe("custom",);
    expect(p.templates.balanced.scene,).toBe("a scene",);
    expect(p.templates.instant.scene,).toBe("",);
    expect(p.templates.detailed.face,).toBe("",);
  });
});

describe("createConfigRegistry", () => {
  it("merges config profiles over built-ins with appended rules", () => {
    const sd = { merge: "merge", profiles: { custom: OVERRIDE, }, modelMatching: [], } as unknown as SdTemplateConfig;
    const reg = createConfigRegistry(sd,);
    expect(reg.profiles.custom?.name,).toBe("Custom",);
    expect(Object.keys(reg.profiles,).length,).toBeGreaterThan(1,);
  });
});
