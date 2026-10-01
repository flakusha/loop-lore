// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the video prompt template registry (FEAT-065-VID):
 * profile resolution, variable substitution, and message building.
 */
import { describe, expect, test, } from "bun:test";
import {
  buildVideoPromptMessages,
  buildVideoSystemPrompt,
  BUILTIN_VIDEO_PROFILES,
  DEFAULT_VIDEO_PROFILE_REGISTRY,
  resolveTemplate,
  resolveVideoProfile,
  VIDEO_TEMPLATE_VARIABLES,
} from "./video-prompt-templates";

const CTX = {
  subject: "Aria casting a spell",
  motion: "slowly raises hands, energy swirls",
  style: "cinematic, volumetric lighting",
  duration: "4s",
  aspectRatio: "16:9",
  cameraMovement: "slow dolly in",
  negativePrompt: "blurry, distorted",
  charName: "Aria",
  userName: "Kai",
  sceneSummary: "a rooftop at dusk",
  lastMessage: "The dragon awakens",
};

describe("video builtin profiles", () => {
  test("covers all six ticket model families with distinct formats", () => {
    expect(Object.keys(BUILTIN_VIDEO_PROFILES,).sort(),).toEqual(
      ["animatediff", "hunyuan", "ltx", "mochi", "svd", "wan",],
    );
    expect(BUILTIN_VIDEO_PROFILES.wan!.promptFormat,).toBe("natural",);
    expect(BUILTIN_VIDEO_PROFILES.animatediff!.promptFormat,).toBe("keyframe-tags",);
    expect(BUILTIN_VIDEO_PROFILES.hunyuan!.promptFormat,).toBe("json",);
  });

  test("every profile resolves a non-empty body for every mode × detail", () => {
    for (const profile of Object.values(BUILTIN_VIDEO_PROFILES,)) {
      for (const mode of ["text2video", "image2video", "scene", "last",] as const) {
        for (const detail of ["instant", "balanced", "detailed",] as const) {
          const { template, } = resolveVideoProfile(mode, detail, { profileId: profile.id, },);
          expect(template.length,).toBeGreaterThan(0,);
          expect(template,).toContain("{{duration}}",);
        }
      }
    }
  });

  test("declares the ticket variables", () => {
    for (const key of ["subject", "motion", "style", "duration", "aspectRatio", "cameraMovement", "negativePrompt",]) {
      expect(key in VIDEO_TEMPLATE_VARIABLES,).toBe(true,);
    }
  });
});

describe("resolveVideoProfile", () => {
  test("defaults to the wan profile", () => {
    const { profile, resolvedProfileId, } = resolveVideoProfile("text2video", "balanced",);
    expect(resolvedProfileId,).toBe("wan",);
    expect(profile.name,).toBe("Wan 2.1/2.2",);
  });

  test("model name pattern matches first-match-wins", () => {
    expect(resolveVideoProfile("text2video", "balanced", { modelName: "Wan2.2-T2V-A14B", },).resolvedProfileId,)
      .toBe("wan",);
    expect(resolveVideoProfile("text2video", "balanced", { modelName: "ltx-video-2", },).resolvedProfileId,)
      .toBe("ltx",);
  });

  test("explicit profileId beats modelName and unknown ids fall to default", () => {
    const opts = { profileId: "mochi", modelName: "wan", };
    expect(resolveVideoProfile("text2video", "balanced", opts,).resolvedProfileId,).toBe("mochi",);
    expect(resolveVideoProfile("text2video", "balanced", { profileId: "ghost", },).resolvedProfileId,).toBe("wan",);
  });

  test("template override replaces the builtin body", () => {
    const { template, } = resolveVideoProfile("text2video", "balanced", {
      templateOverride: "custom {{subject}} body",
    },);
    expect(template,).toBe("custom {{subject}} body",);
  });

  test("unknown detail level falls back to balanced", () => {
    const { template, } = resolveVideoProfile("text2video", "ultra" as never,);
    const { template: balanced, } = resolveVideoProfile("text2video", "balanced",);
    expect(template,).toBe(balanced,);
  });

  test("registry override is honored", () => {
    const custom = {
      profiles: { mine: { ...BUILTIN_VIDEO_PROFILES.wan!, id: "mine", }, },
      defaultProfileId: "mine",
    };
    const { resolvedProfileId, } = resolveVideoProfile("text2video", "balanced", { registry: custom, },);
    expect(resolvedProfileId,).toBe("mine",);
  });
});

describe("resolveTemplate (video substitution)", () => {
  test("fills variables and leaves unknown tokens verbatim", () => {
    const out = resolveTemplate("Subject: {{subject}}. Extra: {{nope}}", CTX,);
    expect(out,).toBe("Subject: Aria casting a spell. Extra: {{nope}}",);
  });

  test("detailed body includes camera movement and negative prompt", () => {
    const { template, } = resolveVideoProfile("text2video", "detailed",);
    const out = resolveTemplate(template, CTX,);
    expect(out,).toContain("Camera: slow dolly in",);
    expect(out,).toContain("Avoid: blurry, distorted",);
  });
});

describe("buildVideoPromptMessages", () => {
  test("returns [system, user] with substituted user content", () => {
    const messages = buildVideoPromptMessages("scene", "balanced", CTX,);
    expect(messages,).toHaveLength(2,);
    expect(messages[0]!.role,).toBe("system",);
    expect(messages[0]!.content,).toContain("video prompt writer",);
    expect(messages[1]!.role,).toBe("user",);
    expect(messages[1]!.content,).toContain("a rooftop at dusk",);
    expect(messages[1]!.content,).toContain("Aria",);
    expect(messages[1]!.content,).not.toContain("{{subject}}",);
  });

  test("system prompt format instruction follows the profile format", () => {
    const json = buildVideoSystemPrompt(BUILTIN_VIDEO_PROFILES.hunyuan!, "detailed",);
    expect(json,).toContain("JSON object",);
    const keyframe = buildVideoSystemPrompt(BUILTIN_VIDEO_PROFILES.animatediff!, "detailed",);
    expect(keyframe,).toContain("[0s:",);
    const natural = buildVideoSystemPrompt(BUILTIN_VIDEO_PROFILES.wan!, "balanced",);
    expect(natural,).toContain("flowing description",);
    expect(natural,).toContain("Be concise",);
  });

  test("default registry constant is the built-in one", () => {
    expect(DEFAULT_VIDEO_PROFILE_REGISTRY.profiles,).toBe(BUILTIN_VIDEO_PROFILES,);
  });
});
