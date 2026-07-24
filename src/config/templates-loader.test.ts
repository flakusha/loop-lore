// src/config/templates-loader.test.ts — Tests for template config loader

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync, } from "node:fs";
import path from "node:path";
import { TEMPLATES_DEFAULTS, } from "./sections/templates";
import type {
  AvatarTemplateConfig,
  ImageEditTemplateConfig,
  LlmTemplateConfig,
  SdTemplateConfig,
} from "./sections/templates";
import {
  findTemplateFiles,
  loadTemplateConfig,
  mergeAvatarConfig,
  mergeImageEditConfig,
  mergeLlmConfig,
  mergeSdConfig,
} from "./templates-loader";

// ── Test Helpers ────────────────────────────────────────────

const TEST_DIR = path.join(import.meta.dir, "..", ".test-templates",);

function setupTestDir() {
  mkdirSync(path.join(TEST_DIR, "configs", "templates",), { recursive: true, },);
}

function teardownTestDir() {
  if (existsSync(TEST_DIR,)) {
    rmSync(TEST_DIR, { recursive: true, },);
  }
}

function writeTemplateFile(name: string, content: string,) {
  writeFileSync(path.join(TEST_DIR, "configs", "templates", name,), content,);
}

// ── Merge Strategy Tests ────────────────────────────────────

describe("mergeLlmConfig", () => {
  test("extend adds new prompts, config wins on conflict", () => {
    const base: LlmTemplateConfig = {
      merge: "extend",
      systemPrompts: {
        chat: "base chat",
        summarize: "base summarize",
        imagePrompt: "base image",
        ooc: "base ooc",
      },
      chatFormats: {},
    };

    const override: Partial<LlmTemplateConfig> = {
      systemPrompts: {
        chat: "override chat",
        summarize: "base summarize",
        imagePrompt: "base image",
        ooc: "base ooc",
        custom: "new prompt",
      },
    };

    const result = mergeLlmConfig(base, override, "extend",);
    expect(result.systemPrompts.chat,).toBe("override chat",);
    expect(result.systemPrompts.custom,).toBe("new prompt",);
  });

  test("replace wipes all defaults", () => {
    const base: LlmTemplateConfig = {
      merge: "extend",
      systemPrompts: {
        chat: "base chat",
        summarize: "base summarize",
        imagePrompt: "base image",
        ooc: "base ooc",
      },
      chatFormats: {},
    };

    const override: Partial<LlmTemplateConfig> = {
      systemPrompts: {
        chat: "new only",
        summarize: "new only",
        imagePrompt: "new only",
        ooc: "new only",
      },
    };

    const result = mergeLlmConfig(base, override, "replace",);
    expect(result.systemPrompts.chat,).toBe("new only",);
    expect(result.systemPrompts,).not.toHaveProperty("custom",);
  });

  test("override deep merges fields", () => {
    const base: LlmTemplateConfig = {
      merge: "extend",
      systemPrompts: {
        chat: "base chat",
        summarize: "base summarize",
        imagePrompt: "base image",
        ooc: "base ooc",
      },
      chatFormats: {
        alpaca: {
          system: "base system",
          user: "base user",
          assistant: "base assistant",
        },
      },
    };

    const override: Partial<LlmTemplateConfig> = {
      chatFormats: {
        chatml: {
          system: "new system",
          user: "new user",
          assistant: "new assistant",
        },
      },
    };

    const result = mergeLlmConfig(base, override, "override",);
    expect(result.chatFormats.alpaca,).toBeDefined();
    expect(result.chatFormats.chatml,).toBeDefined();
  });
});

describe("mergeSdConfig", () => {
  test("extend adds new profiles", () => {
    const base: SdTemplateConfig = {
      merge: "extend",
      profiles: {},
      modelMatching: [],
    };

    const override: Partial<SdTemplateConfig> = {
      profiles: {
        custom: {
          id: "custom",
          name: "Custom",
          families: ["custom",],
          promptFormat: "natural",
          maxTokenHint: 300,
          defaults: { cfgScale: 7, steps: 25, sampler: "euler", },
        },
      },
      modelMatching: [{ pattern: "custom", profileId: "custom", },],
    };

    const result = mergeSdConfig(base, override, "extend",);
    expect(result.profiles.custom,).toBeDefined();
    expect(result.modelMatching,).toHaveLength(1,);
  });

  test("replace wipes all defaults", () => {
    const base: SdTemplateConfig = {
      merge: "extend",
      profiles: {
        existing: {
          id: "existing",
          name: "Existing",
          families: ["sd1",],
          promptFormat: "tags",
          maxTokenHint: 75,
          defaults: { cfgScale: 7, steps: 25, sampler: "euler", },
        },
      },
      modelMatching: [{ pattern: "sd1", profileId: "existing", },],
    };

    const override: Partial<SdTemplateConfig> = {
      profiles: {
        new: {
          id: "new",
          name: "New",
          families: ["custom",],
          promptFormat: "natural",
          maxTokenHint: 300,
          defaults: { cfgScale: 7, steps: 25, sampler: "euler", },
        },
      },
    };

    const result = mergeSdConfig(base, override, "replace",);
    expect(result.profiles.existing,).toBeUndefined();
    expect(result.profiles.new,).toBeDefined();
  });
});

describe("mergeAvatarConfig", () => {
  test("extend adds new emotions", () => {
    const base: AvatarTemplateConfig = {
      merge: "extend",
      emotions: {
        happy: { asset: "happy.png", intent: "smiles", },
      },
      intentPatterns: [],
    };

    const override: Partial<AvatarTemplateConfig> = {
      emotions: {
        sad: { asset: "sad.png", intent: "frowns", },
      },
      intentPatterns: [{ pattern: "cry", emotion: "sad", },],
    };

    const result = mergeAvatarConfig(base, override, "extend",);
    expect(result.emotions.happy,).toBeDefined();
    expect(result.emotions.sad,).toBeDefined();
    expect(result.intentPatterns,).toHaveLength(1,);
  });

  test("replace wipes all emotions", () => {
    const base: AvatarTemplateConfig = {
      merge: "extend",
      emotions: {
        happy: { asset: "happy.png", intent: "smiles", },
      },
      intentPatterns: [{ pattern: "smile", emotion: "happy", },],
    };

    const override: Partial<AvatarTemplateConfig> = {
      emotions: {
        custom: { asset: "custom.png", intent: "custom", },
      },
    };

    const result = mergeAvatarConfig(base, override, "replace",);
    expect(result.emotions.happy,).toBeUndefined();
    expect(result.emotions.custom,).toBeDefined();
    expect(result.intentPatterns,).toHaveLength(0,);
  });
});

describe("mergeImageEditConfig", () => {
  test("extend adds new workflows", () => {
    const base: ImageEditTemplateConfig = {
      merge: "extend",
      workflows: {},
    };

    const override: Partial<ImageEditTemplateConfig> = {
      workflows: {
        upscale: {
          id: "upscale",
          name: "Upscale",
          category: "upscale",
          backend: "comfyui",
          description: "Upscale image",
        },
      },
    };

    const result = mergeImageEditConfig(base, override, "extend",);
    expect(result.workflows.upscale,).toBeDefined();
  });

  test("replace wipes all workflows", () => {
    const base: ImageEditTemplateConfig = {
      merge: "extend",
      workflows: {
        existing: {
          id: "existing",
          name: "Existing",
          category: "edit",
          backend: "comfyui",
          description: "Existing workflow",
        },
      },
    };

    const override: Partial<ImageEditTemplateConfig> = {
      workflows: {
        new: {
          id: "new",
          name: "New",
          category: "edit",
          backend: "comfyui",
          description: "New workflow",
        },
      },
    };

    const result = mergeImageEditConfig(base, override, "replace",);
    expect(result.workflows.existing,).toBeUndefined();
    expect(result.workflows.new,).toBeDefined();
  });
});

// ── Loader Integration Tests ────────────────────────────────

describe("loadTemplateConfig", () => {
  beforeEach(() => {
    setupTestDir();
  },);

  afterEach(() => {
    teardownTestDir();
  },);

  test("returns defaults when no template files exist", () => {
    const config = loadTemplateConfig(TEST_DIR,);
    expect(config.llm.systemPrompts.chat,).toBe(
      TEMPLATES_DEFAULTS.llm.systemPrompts.chat,
    );
    expect(config.sd.profiles,).toEqual({},);
    expect(config.avatar.emotions,).toEqual({},);
    expect(config.imageEdit.workflows,).toEqual({},);
  });

  test("loads llm.yaml and merges with defaults", () => {
    writeTemplateFile(
      "llm.yaml",
      `merge: extend
systemPrompts:
  chat: "Custom chat prompt"
  summarize: "Custom summarize"
  imagePrompt: "Custom image prompt"
  ooc: "Custom ooc"
  custom: "New custom prompt"
`,
    );

    const config = loadTemplateConfig(TEST_DIR,);
    expect(config.llm.systemPrompts.chat,).toBe("Custom chat prompt",);
    expect(config.llm.systemPrompts.custom,).toBe("New custom prompt",);
  });

  test("loads avatar.yaml and merges emotions", () => {
    writeTemplateFile(
      "avatar.yaml",
      `merge: extend
emotions:
  custom:
    asset: custom.png
    intent: "Custom emotion"
intentPatterns:
  - pattern: custom
    emotion: custom
`,
    );

    const config = loadTemplateConfig(TEST_DIR,);
    expect(config.avatar.emotions.custom,).toBeDefined();
    expect(config.avatar.emotions.custom!.asset,).toBe("custom.png",);
    expect(config.avatar.intentPatterns,).toHaveLength(1,);
  });

  test("replace strategy wipes defaults", () => {
    writeTemplateFile(
      "avatar.yaml",
      `merge: replace
emotions:
  only:
    asset: only.png
    intent: "Only emotion"
`,
    );

    const config = loadTemplateConfig(TEST_DIR,);
    expect(config.avatar.emotions,).not.toHaveProperty("happy",);
    expect(config.avatar.emotions.only,).toBeDefined();
  });

  test("throws on invalid YAML", () => {
    writeTemplateFile("llm.yaml", "invalid: [yaml: broken",);

    expect(() => loadTemplateConfig(TEST_DIR,)).toThrow(
      "Failed to load template config",
    );
  });
});

// ── File Discovery Tests ────────────────────────────────────

describe("findTemplateFiles", () => {
  beforeEach(() => {
    setupTestDir();
  },);

  afterEach(() => {
    teardownTestDir();
  },);

  test("finds template files in configs/templates/", () => {
    writeTemplateFile("llm.yaml", "merge: extend",);
    writeTemplateFile("sd.yaml", "merge: extend",);

    const files = findTemplateFiles(TEST_DIR,);
    expect(files.has("llm",),).toBe(true,);
    expect(files.has("sd",),).toBe(true,);
  });

  test("first match wins for duplicate domains", () => {
    writeTemplateFile("llm.yaml", "merge: extend",);

    const files = findTemplateFiles(TEST_DIR,);
    expect(files.size,).toBe(1,);
  });
});
