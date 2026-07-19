/**
 * Tests for generation/prompt-templates.ts — image model profiles & templates
 */

import { describe, expect, test, } from "bun:test";
import {
  buildImagePrompt,
  buildImagePromptMessages,
  buildImageSystemPrompt,
  BUILTIN_PROFILES,
  DEFAULT_PROFILE_REGISTRY,
  generatePrompt,
  resolveProfile,
  resolveTemplate,
} from "./prompt-templates";
import type { TemplateContext, } from "./prompt-templates";

describe("resolveTemplate", () => {
  const ctx: TemplateContext = {
    charName: "Alice",
    charDescription: "blue eyes, red hair, wizard",
    userName: "Bob",
    userDescription: "brave adventurer",
    lastMessage: "Alice casts a fireball at the dragon",
    sceneSummary: "a dark cave with a dragon",
    chatHistory: "Alice: I will defeat you!\\nDragon: Roar!",
  };

  test("replaces all tokens", () => {
    const result = resolveTemplate("{{charName}} casts {{lastMessage}}", ctx,);
    expect(result,).toBe("Alice casts Alice casts a fireball at the dragon",);
  });

  test("handles empty context fields", () => {
    const result = resolveTemplate("{{charName}} - {{negativePrompt}}", { ...ctx, negativePrompt: "", },);
    expect(result,).toBe("Alice - ",);
  });

  test("handles extra tokens", () => {
    const result = resolveTemplate("{{charName}} uses {{spell}}", {
      ...ctx,
      extra: { spell: "fireball", },
    },);
    expect(result,).toBe("Alice uses fireball",);
  });

  test("leaves unknown tokens unchanged", () => {
    const result = resolveTemplate("{{charName}} {{unknownToken}}", ctx,);
    expect(result,).toBe("Alice {{unknownToken}}",);
  });
});

describe("resolveProfile", () => {
  test("returns default profile when no options given", () => {
    const { profile, resolvedProfileId, } = resolveProfile("yourself", "balanced",);
    expect(resolvedProfileId,).toBe("sdxl",);
    expect(profile.id,).toBe("sdxl",);
  });

  test("resolves by explicit profileId", () => {
    const { resolvedProfileId, } = resolveProfile("yourself", "balanced", { profileId: "flux", },);
    expect(resolvedProfileId,).toBe("flux",);
  });

  test("resolves by model name matching", () => {
    const { resolvedProfileId, } = resolveProfile("yourself", "balanced", {
      modelName: "flux1-dev",
    },);
    expect(resolvedProfileId,).toBe("flux",);
  });

  test("matches pony model names", () => {
    const { resolvedProfileId, } = resolveProfile("yourself", "balanced", {
      modelName: "ponyDiffusionV6",
    },);
    expect(resolvedProfileId,).toBe("pony",);
  });

  test("matches illustrious model names", () => {
    const { resolvedProfileId, } = resolveProfile("yourself", "balanced", {
      modelName: "illustriousXLV10",
    },);
    expect(resolvedProfileId,).toBe("illustrious",);
  });

  test("matches krea model names", () => {
    const { resolvedProfileId, } = resolveProfile("yourself", "balanced", {
      modelName: "krea-2-turbo",
    },);
    expect(resolvedProfileId,).toBe("krea2",);
  });

  test("matches anima model names", () => {
    const { resolvedProfileId, } = resolveProfile("yourself", "balanced", {
      modelName: "anima-aesthetic-v1.1",
    },);
    expect(resolvedProfileId,).toBe("anima",);
  });

  test("falls back to default on unknown model name", () => {
    const { resolvedProfileId, } = resolveProfile("yourself", "balanced", {
      modelName: "some-unknown-model-v3",
    },);
    expect(resolvedProfileId,).toBe("sdxl",);
  });

  test("falls back to default on unknown profileId", () => {
    const { resolvedProfileId, } = resolveProfile("yourself", "balanced", {
      profileId: "nonexistent",
    },);
    expect(resolvedProfileId,).toBe("sdxl",);
  });

  test("raw_last mode maps to last template", () => {
    const { template, } = resolveProfile("raw_last", "balanced",);
    expect(template,).toContain("lastMessage",);
  });

  test("free mode maps to last template as fallback", () => {
    const { template, } = resolveProfile("free", "balanced",);
    expect(template,).toContain("lastMessage",);
  });

  test("detail level affects template verbosity", () => {
    const instant = resolveProfile("yourself", "instant", { profileId: "flux", },);
    const detailed = resolveProfile("yourself", "detailed", { profileId: "flux", },);
    expect(instant.template.length,).toBeLessThan(detailed.template.length,);
  });

  test("tag-based templates contain 'ignore previous instructions'", () => {
    const { template, } = resolveProfile("yourself", "balanced", { profileId: "sd1", },);
    expect(template,).toContain("Ignore previous instructions",);
    expect(template,).toContain("comma-separated",);
  });

  test("natural language templates do not contain 'ignore previous'", () => {
    const { template, } = resolveProfile("yourself", "balanced", { profileId: "flux", },);
    expect(template,).not.toContain("Ignore previous instructions",);
    expect(template,).toContain("natural language",);
  });

  test("pony templates include score tags", () => {
    const { template, } = resolveProfile("yourself", "balanced", { profileId: "pony", },);
    expect(template,).toContain("score_9",);
  });

  test("ideogram templates produce JSON output", () => {
    const { template, } = resolveProfile("yourself", "instant", { profileId: "ideogram", },);
    expect(template,).toContain("JSON",);
  });

  test("krea2 detailed templates are very long", () => {
    const { template, } = resolveProfile("yourself", "detailed", { profileId: "krea2", },);
    expect(template.length,).toBeGreaterThan(100,);
  });

  test("anima templates use lowercase keywords style", () => {
    const { template, } = resolveProfile("yourself", "balanced", { profileId: "anima", },);
    expect(template,).toContain("lowercase keywords",);
  });

  test("all profiles have all three detail levels", () => {
    for (const profile of Object.values(BUILTIN_PROFILES,)) {
      expect(profile.templates.instant,).toBeDefined();
      expect(profile.templates.balanced,).toBeDefined();
      expect(profile.templates.detailed,).toBeDefined();
    }
  });

  test("all profiles have all six mode templates", () => {
    const modes = ["yourself", "face", "me", "scene", "last", "background",] as const;
    for (const profile of Object.values(BUILTIN_PROFILES,)) {
      for (const detail of ["instant", "balanced", "detailed",] as const) {
        for (const mode of modes) {
          expect(profile.templates[detail][mode],).toBeDefined();
        }
      }
    }
  });
});

describe("generatePrompt", () => {
  const ctx: TemplateContext = {
    charName: "Alice",
    charDescription: "blue eyes, red hair, wizard",
    userName: "Bob",
    userDescription: "brave adventurer",
    lastMessage: "Alice casts a fireball at the dragon",
    sceneSummary: "a dark cave with a dragon",
    chatHistory: "",
  };

  test("returns prompt, profile, and profileId", () => {
    const result = generatePrompt("yourself", "balanced", ctx, { profileId: "flux", },);
    expect(result.prompt,).toContain("Alice",);
    expect(result.profile.id,).toBe("flux",);
    expect(result.resolvedProfileId,).toBe("flux",);
  });

  test("fills in charName and charDescription", () => {
    const result = generatePrompt("yourself", "balanced", ctx, { profileId: "sd1", },);
    expect(result.prompt,).toContain("Alice",);
    expect(result.prompt,).toContain("wizard",);
  });

  test("scene mode uses sceneSummary", () => {
    const result = generatePrompt("scene", "balanced", ctx, { profileId: "sd1", },);
    expect(result.prompt,).toContain("dark cave",);
  });

  test("last mode uses lastMessage", () => {
    const result = generatePrompt("last", "balanced", ctx, { profileId: "sd1", },);
    expect(result.prompt,).toContain("fireball",);
  });
});

describe("DEFAULT_PROFILE_REGISTRY", () => {
  test("has all profiles in modelMatching", () => {
    const matchedIds = new Set(DEFAULT_PROFILE_REGISTRY.modelMatching!.map((m,) => m.profileId),);
    const profileIds = new Set(Object.keys(DEFAULT_PROFILE_REGISTRY.profiles,),);
    // Every profile should be reachable by at least one match rule
    for (const id of profileIds) {
      expect(matchedIds.has(id,),).toBe(true,);
    }
  });

  test("default profile exists in profiles", () => {
    expect(DEFAULT_PROFILE_REGISTRY.profiles[DEFAULT_PROFILE_REGISTRY.defaultProfileId],).toBeDefined();
  });
});

describe("buildImageSystemPrompt", () => {
  test("tag format includes booru-style mention", () => {
    const prompt = buildImageSystemPrompt(BUILTIN_PROFILES.sd1!, "balanced",);
    expect(prompt,).toContain("image prompt writer",);
    expect(prompt,).toContain("booru-style",);
  });

  test("natural language format does not mention booru", () => {
    const prompt = buildImageSystemPrompt(BUILTIN_PROFILES.flux!, "balanced",);
    expect(prompt,).toContain("natural language",);
    expect(prompt,).not.toContain("booru",);
  });

  test("json format mentions JSON", () => {
    const prompt = buildImageSystemPrompt(BUILTIN_PROFILES.ideogram!, "balanced",);
    expect(prompt,).toContain("JSON object",);
  });

  test("instant mode shorter than detailed mode", () => {
    const profile = BUILTIN_PROFILES.sdxl!;
    const instant = buildImageSystemPrompt(profile, "instant",);
    const detailed = buildImageSystemPrompt(profile, "detailed",);
    expect(instant.length,).toBeLessThan(detailed.length,);
  });

  test("includes role switch instruction", () => {
    const prompt = buildImageSystemPrompt(BUILTIN_PROFILES.flux!, "balanced",);
    expect(prompt,).toContain("Forget previous instructions",);
  });

  test("no wrapper text instruction present", () => {
    const prompt = buildImageSystemPrompt(BUILTIN_PROFILES.sd1!, "balanced",);
    expect(prompt,).toContain("No explanation, no markdown, no wrapper text",);
  });
});

describe("buildImagePromptMessages", () => {
  const ctx: TemplateContext = {
    charName: "Alice",
    charDescription: "blue eyes, red hair, wizard",
    userName: "Bob",
    userDescription: "brave adventurer",
    lastMessage: "Alice casts a fireball",
    sceneSummary: "dark cave with dragon",
    chatHistory: "",
  };

  test("returns system + user messages", () => {
    const messages = buildImagePromptMessages("yourself", "balanced", ctx, { profileId: "flux", },);
    expect(messages,).toHaveLength(2,);
    expect(messages[0]!.role,).toBe("system",);
    expect(messages[1]!.role,).toBe("user",);
  });

  test("system message differs per model profile", () => {
    const tagMsgs = buildImagePromptMessages("yourself", "balanced", ctx, { profileId: "sd1", },);
    const natMsgs = buildImagePromptMessages("yourself", "balanced", ctx, { profileId: "flux", },);
    expect(tagMsgs[0]!.content,).not.toBe(natMsgs[0]!.content,);
  });

  test("user message contains resolved template tokens", () => {
    const messages = buildImagePromptMessages("yourself", "balanced", ctx, { profileId: "sd1", },);
    expect(messages[1]!.content,).toContain("Alice",);
    expect(messages[1]!.content,).toContain("wizard",);
  });
});

describe("buildImagePrompt", () => {
  const ctx: TemplateContext = {
    charName: "Alice",
    charDescription: "blue eyes, red hair, wizard",
    userName: "Bob",
    userDescription: "brave adventurer",
    lastMessage: "Alice casts a fireball",
    sceneSummary: "dark cave with dragon",
    chatHistory: "",
  };

  test("returns all fields", () => {
    const result = buildImagePrompt("yourself", "balanced", ctx, { profileId: "flux", },);
    expect(result.messages,).toHaveLength(2,);
    expect(result.systemPrompt,).toBeTruthy();
    expect(result.userMessage,).toBeTruthy();
    expect(result.profile.id,).toBe("flux",);
    expect(result.resolvedProfileId,).toBe("flux",);
    expect(result.estimatedTotalTokens,).toBeGreaterThan(0,);
  });

  test("instant estimated tokens less than detailed", () => {
    const instant = buildImagePrompt("yourself", "instant", ctx, { profileId: "flux", },);
    const detailed = buildImagePrompt("yourself", "detailed", ctx, { profileId: "flux", },);
    expect(instant.estimatedTotalTokens,).toBeLessThan(detailed.estimatedTotalTokens,);
  });
});
