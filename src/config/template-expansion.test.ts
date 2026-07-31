import { describe, expect, test, } from "bun:test";
import type { AvatarTemplateConfig, } from "./sections/templates";
import {
  expandAvatarConfig,
  type ExpansionConfig,
  extractActions,
  extractKeywords,
  findMissingAvatars,
  validateExpansionConfig,
} from "./template-expansion";

// ── Test Data ──────────────────────────────────────────────

const BASE_CONFIG: AvatarTemplateConfig = {
  merge: "extend",
  emotions: {
    happy: {
      asset: "happy.png",
      intent: "The character smiles warmly",
    },
    sad: {
      asset: "sad.png",
      intent: "The character looks downcast",
    },
  },
  intentPatterns: [
    { pattern: "smile", emotion: "happy", },
    { pattern: "grin", emotion: "happy", },
    { pattern: "cry", emotion: "sad", },
  ],
};

const EMPTY_CONFIG: AvatarTemplateConfig = {
  merge: "extend",
  emotions: {},
  intentPatterns: [],
};

// ── expandAvatarConfig ─────────────────────────────────────

describe("expandAvatarConfig", () => {
  test("extend strategy adds new emotions", () => {
    const expansion: ExpansionConfig = {
      merge: "extend",
      emotions: {
        angry: {
          asset: "angry.png",
          intent: "The character frowns with irritation",
        },
      },
    };

    const result = expandAvatarConfig(BASE_CONFIG, expansion,);

    expect(result.emotions.happy,).toBeDefined();
    expect(result.emotions.sad,).toBeDefined();
    expect(result.emotions.angry,).toBeDefined();
    expect(result.emotions.angry?.asset,).toBe("angry.png",);
  });

  test("extend strategy does not override existing emotions", () => {
    const expansion: ExpansionConfig = {
      merge: "extend",
      emotions: {
        happy: {
          asset: "different-happy.png",
          intent: "Different intent",
        },
      },
    };

    const result = expandAvatarConfig(BASE_CONFIG, expansion,);

    expect(result.emotions.happy?.asset,).toBe("happy.png",);
    expect(result.emotions.happy?.intent,).toBe("The character smiles warmly",);
  });

  test("extend strategy adds new intent patterns", () => {
    const expansion: ExpansionConfig = {
      merge: "extend",
      intentPatterns: [
        { pattern: "frown", emotion: "sad", },
        { pattern: "laugh", emotion: "happy", },
      ],
    };

    const result = expandAvatarConfig(BASE_CONFIG, expansion,);

    expect(result.intentPatterns.length,).toBe(5,);
    expect(result.intentPatterns.some((p,) => p.pattern === "frown"),).toBe(true,);
    expect(result.intentPatterns.some((p,) => p.pattern === "laugh"),).toBe(true,);
  });

  test("extend strategy does not add duplicate patterns", () => {
    const expansion: ExpansionConfig = {
      merge: "extend",
      intentPatterns: [
        { pattern: "smile", emotion: "happy", },
      ],
    };

    const result = expandAvatarConfig(BASE_CONFIG, expansion,);

    expect(result.intentPatterns.length,).toBe(3,);
  });

  test("override strategy deep merges emotions", () => {
    const expansion: ExpansionConfig = {
      merge: "override",
      emotions: {
        happy: {
          asset: "new-happy.png",
          intent: "New intent",
        },
        angry: {
          asset: "angry.png",
          intent: "Angry",
        },
      },
    };

    const result = expandAvatarConfig(BASE_CONFIG, expansion,);

    expect(result.emotions.happy?.asset,).toBe("new-happy.png",);
    expect(result.emotions.angry?.asset,).toBe("angry.png",);
  });

  test("replace strategy wipes base config", () => {
    const expansion: ExpansionConfig = {
      merge: "replace",
      emotions: {
        angry: {
          asset: "angry.png",
          intent: "Angry",
        },
      },
    };

    const result = expandAvatarConfig(BASE_CONFIG, expansion,);

    expect(result.emotions.happy,).toBeUndefined();
    expect(result.emotions.sad,).toBeUndefined();
    expect(result.emotions.angry,).toBeDefined();
  });

  test("extend with empty expansion returns base config", () => {
    const expansion: ExpansionConfig = {
      merge: "extend",
    };

    const result = expandAvatarConfig(BASE_CONFIG, expansion,);

    expect(result.emotions.happy,).toBeDefined();
    expect(result.emotions.sad,).toBeDefined();
    expect(result.intentPatterns.length,).toBe(3,);
  });

  test("extend with empty base config adds new entries", () => {
    const expansion: ExpansionConfig = {
      merge: "extend",
      emotions: {
        happy: {
          asset: "happy.png",
          intent: "Happy",
        },
      },
      intentPatterns: [
        { pattern: "smile", emotion: "happy", },
      ],
    };

    const result = expandAvatarConfig(EMPTY_CONFIG, expansion,);

    expect(result.emotions.happy,).toBeDefined();
    expect(result.intentPatterns.length,).toBe(1,);
  });

  test("override replaces intent patterns when provided", () => {
    const expansion: ExpansionConfig = {
      merge: "override",
      intentPatterns: [
        { pattern: "new_pattern", emotion: "happy", },
      ],
    };

    const result = expandAvatarConfig(BASE_CONFIG, expansion,);

    expect(result.intentPatterns.length,).toBe(1,);
    expect(result.intentPatterns[0]?.pattern,).toBe("new_pattern",);
  });

  test("replace with empty emotions returns empty config", () => {
    const expansion: ExpansionConfig = {
      merge: "replace",
      emotions: {},
    };

    const result = expandAvatarConfig(BASE_CONFIG, expansion,);

    expect(Object.keys(result.emotions,).length,).toBe(0,);
  });

  test("extend handles patterns with same pattern but different emotions", () => {
    const expansion: ExpansionConfig = {
      merge: "extend",
      intentPatterns: [
        { pattern: "smile", emotion: "sad", },
      ],
    };

    const result = expandAvatarConfig(BASE_CONFIG, expansion,);

    expect(result.intentPatterns.length,).toBe(4,);
  });

  test("extend handles patterns with different pattern but same emotion", () => {
    const expansion: ExpansionConfig = {
      merge: "extend",
      intentPatterns: [
        { pattern: "beam", emotion: "happy", },
      ],
    };

    const result = expandAvatarConfig(BASE_CONFIG, expansion,);

    expect(result.intentPatterns.length,).toBe(4,);
  });
});

// ── extractKeywords ────────────────────────────────────────

describe("extractKeywords", () => {
  test("extracts keywords from emotion intents", () => {
    const keywords = extractKeywords(BASE_CONFIG,);

    expect(keywords,).toContain("smiles",);
    expect(keywords,).toContain("warmly",);
    expect(keywords,).toContain("downcast",);
  });

  test("extracts keywords from intent patterns", () => {
    const keywords = extractKeywords(BASE_CONFIG,);

    expect(keywords,).toContain("smile",);
    expect(keywords,).toContain("grin",);
    expect(keywords,).toContain("cry",);
  });

  test("deduplicates keywords", () => {
    const config: AvatarTemplateConfig = {
      merge: "extend",
      emotions: {
        happy: {
          asset: "happy.png",
          intent: "happy smile happy",
        },
      },
      intentPatterns: [
        { pattern: "happy", emotion: "happy", },
      ],
    };

    const keywords = extractKeywords(config,);
    const happyCount = keywords.filter((k,) => k === "happy").length;

    expect(happyCount,).toBe(1,);
  });

  test("returns empty array for empty config", () => {
    const keywords = extractKeywords(EMPTY_CONFIG,);

    expect(keywords.length,).toBe(0,);
  });

  test("filters out short words", () => {
    const config: AvatarTemplateConfig = {
      merge: "extend",
      emotions: {
        happy: {
          asset: "happy.png",
          intent: "I am so happy today",
        },
      },
      intentPatterns: [],
    };

    const keywords = extractKeywords(config,);

    expect(keywords,).not.toContain("I",);
    expect(keywords,).not.toContain("am",);
    expect(keywords,).not.toContain("so",);
    expect(keywords,).toContain("happy",);
    expect(keywords,).toContain("today",);
  });

  test("converts to lowercase", () => {
    const config: AvatarTemplateConfig = {
      merge: "extend",
      emotions: {
        happy: {
          asset: "happy.png",
          intent: "Happy Smile",
        },
      },
      intentPatterns: [],
    };

    const keywords = extractKeywords(config,);

    expect(keywords,).toContain("happy",);
    expect(keywords,).toContain("smile",);
  });

  test("handles multiple emotions", () => {
    const config: AvatarTemplateConfig = {
      merge: "extend",
      emotions: {
        happy: {
          asset: "happy.png",
          intent: "The character smiles",
        },
        sad: {
          asset: "sad.png",
          intent: "The character cries",
        },
      },
      intentPatterns: [],
    };

    const keywords = extractKeywords(config,);

    expect(keywords,).toContain("smiles",);
    expect(keywords,).toContain("cries",);
  });
});

// ── extractActions ─────────────────────────────────────────

describe("extractActions", () => {
  test("extracts actions for present emotions", () => {
    const actions = extractActions(BASE_CONFIG,);

    expect(actions,).toContain("smile",);
    expect(actions,).toContain("laugh",);
    expect(actions,).toContain("cry",);
    expect(actions,).toContain("weep",);
  });

  test("does not extract actions for missing emotions", () => {
    const config: AvatarTemplateConfig = {
      merge: "extend",
      emotions: {
        happy: {
          asset: "happy.png",
          intent: "Happy",
        },
      },
      intentPatterns: [],
    };

    const actions = extractActions(config,);

    expect(actions,).toContain("smile",);
    expect(actions,).not.toContain("cry",);
  });

  test("returns empty array for empty config", () => {
    const actions = extractActions(EMPTY_CONFIG,);

    expect(actions.length,).toBe(0,);
  });

  test("extracts actions for all emotion types", () => {
    const allEmotionsConfig: AvatarTemplateConfig = {
      merge: "extend",
      emotions: {
        happy: { asset: "happy.png", intent: "Happy", },
        sad: { asset: "sad.png", intent: "Sad", },
        angry: { asset: "angry.png", intent: "Angry", },
        surprised: { asset: "surprised.png", intent: "Surprised", },
        fearful: { asset: "fearful.png", intent: "Fearful", },
        disgusted: { asset: "disgusted.png", intent: "Disgusted", },
        neutral: { asset: "neutral.png", intent: "Neutral", },
        excited: { asset: "excited.png", intent: "Excited", },
        anxious: { asset: "anxious.png", intent: "Anxious", },
        calm: { asset: "calm.png", intent: "Calm", },
        confused: { asset: "confused.png", intent: "Confused", },
        proud: { asset: "proud.png", intent: "Proud", },
        shameful: { asset: "shameful.png", intent: "Shameful", },
        loving: { asset: "loving.png", intent: "Loving", },
        jealous: { asset: "jealous.png", intent: "Jealous", },
        grateful: { asset: "grateful.png", intent: "Grateful", },
        bored: { asset: "bored.png", intent: "Bored", },
      },
      intentPatterns: [],
    };

    const actions = extractActions(allEmotionsConfig,);

    expect(actions,).toContain("smile",);
    expect(actions,).toContain("cry",);
    expect(actions,).toContain("shout",);
    expect(actions,).toContain("gasp",);
    expect(actions,).toContain("tremble",);
    expect(actions,).toContain("recoil",);
    expect(actions,).toContain("nod",);
    expect(actions,).toContain("jump",);
    expect(actions,).toContain("fidget",);
    expect(actions,).toContain("breathe",);
    expect(actions,).toContain("tilt",);
    expect(actions,).toContain("stand",);
    expect(actions,).toContain("hide",);
    expect(actions,).toContain("embrace",);
    expect(actions,).toContain("glare",);
    expect(actions,).toContain("thank",);
    expect(actions,).toContain("yawn",);
  });

  test("deduplicates actions across emotions", () => {
    const config: AvatarTemplateConfig = {
      merge: "extend",
      emotions: {
        happy: { asset: "happy.png", intent: "Happy", },
        excited: { asset: "excited.png", intent: "Excited", },
      },
      intentPatterns: [],
    };

    const actions = extractActions(config,);

    // Both happy and excited have "jump" and "cheer"
    const jumpCount = actions.filter((a,) => a === "jump").length;
    const cheerCount = actions.filter((a,) => a === "cheer").length;

    expect(jumpCount,).toBe(1,);
    expect(cheerCount,).toBe(1,);
  });
});

// ── findMissingAvatars ────────────────────────────────────

describe("findMissingAvatars", () => {
  test("finds emotions with empty assets", () => {
    const config: AvatarTemplateConfig = {
      merge: "extend",
      emotions: {
        happy: {
          asset: "happy.png",
          intent: "Happy",
        },
        sad: {
          asset: "",
          intent: "Sad",
        },
      },
      intentPatterns: [],
    };

    const missing = findMissingAvatars(config,);

    expect(missing,).toContain("sad",);
    expect(missing,).not.toContain("happy",);
  });

  test("returns empty array when all have assets", () => {
    const missing = findMissingAvatars(BASE_CONFIG,);

    expect(missing.length,).toBe(0,);
  });

  test("returns empty array for empty config", () => {
    const missing = findMissingAvatars(EMPTY_CONFIG,);

    expect(missing.length,).toBe(0,);
  });

  test("finds multiple missing avatars", () => {
    const config: AvatarTemplateConfig = {
      merge: "extend",
      emotions: {
        happy: {
          asset: "happy.png",
          intent: "Happy",
        },
        sad: {
          asset: "",
          intent: "Sad",
        },
        angry: {
          asset: "",
          intent: "Angry",
        },
      },
      intentPatterns: [],
    };

    const missing = findMissingAvatars(config,);

    expect(missing.length,).toBe(2,);
    expect(missing,).toContain("sad",);
    expect(missing,).toContain("angry",);
  });

  test("handles undefined asset field", () => {
    const config: AvatarTemplateConfig = {
      merge: "extend",
      emotions: {
        happy: {
          asset: undefined as unknown as string,
          intent: "Happy",
        },
      },
      intentPatterns: [],
    };

    const missing = findMissingAvatars(config,);

    expect(missing,).toContain("happy",);
  });
});

// ── validateExpansionConfig ────────────────────────────────

describe("validateExpansionConfig", () => {
  test("returns empty array for valid config", () => {
    const errors = validateExpansionConfig(BASE_CONFIG,);

    expect(errors.length,).toBe(0,);
  });

  test("detects duplicate intent patterns", () => {
    const config: AvatarTemplateConfig = {
      merge: "extend",
      emotions: {
        happy: {
          asset: "happy.png",
          intent: "Happy",
        },
      },
      intentPatterns: [
        { pattern: "smile", emotion: "happy", },
        { pattern: "smile", emotion: "happy", },
      ],
    };

    const errors = validateExpansionConfig(config,);

    expect(errors.some((e,) => e.includes("Duplicate",)),).toBe(true,);
  });

  test("detects references to unknown emotions", () => {
    const config: AvatarTemplateConfig = {
      merge: "extend",
      emotions: {
        happy: {
          asset: "happy.png",
          intent: "Happy",
        },
      },
      intentPatterns: [
        { pattern: "smile", emotion: "unknown_emotion", },
      ],
    };

    const errors = validateExpansionConfig(config,);

    expect(errors.some((e,) => e.includes("unknown emotion",)),).toBe(true,);
  });

  test("detects empty emotion intents", () => {
    const config: AvatarTemplateConfig = {
      merge: "extend",
      emotions: {
        happy: {
          asset: "happy.png",
          intent: "",
        },
      },
      intentPatterns: [],
    };

    const errors = validateExpansionConfig(config,);

    expect(errors.some((e,) => e.includes("empty intent",)),).toBe(true,);
  });

  test("returns empty array for empty config", () => {
    const errors = validateExpansionConfig(EMPTY_CONFIG,);

    expect(errors.length,).toBe(0,);
  });

  test("allows same pattern with different emotions", () => {
    const config: AvatarTemplateConfig = {
      merge: "extend",
      emotions: {
        happy: { asset: "happy.png", intent: "Happy", },
        sad: { asset: "sad.png", intent: "Sad", },
      },
      intentPatterns: [
        { pattern: "smile", emotion: "happy", },
        { pattern: "smile", emotion: "sad", },
      ],
    };

    const errors = validateExpansionConfig(config,);

    expect(errors.some((e,) => e.includes("Duplicate",)),).toBe(false,);
  });

  test("allows same emotion with different patterns", () => {
    const config: AvatarTemplateConfig = {
      merge: "extend",
      emotions: {
        happy: { asset: "happy.png", intent: "Happy", },
      },
      intentPatterns: [
        { pattern: "smile", emotion: "happy", },
        { pattern: "grin", emotion: "happy", },
      ],
    };

    const errors = validateExpansionConfig(config,);

    expect(errors.some((e,) => e.includes("Duplicate",)),).toBe(false,);
  });

  test("detects multiple validation errors", () => {
    const config: AvatarTemplateConfig = {
      merge: "extend",
      emotions: {
        happy: {
          asset: "happy.png",
          intent: "",
        },
      },
      intentPatterns: [
        { pattern: "smile", emotion: "unknown", },
        { pattern: "smile", emotion: "unknown", },
      ],
    };

    const errors = validateExpansionConfig(config,);

    expect(errors.length,).toBeGreaterThanOrEqual(2,);
  });

  test("validates multiple emotions with empty intents", () => {
    const config: AvatarTemplateConfig = {
      merge: "extend",
      emotions: {
        happy: {
          asset: "happy.png",
          intent: "",
        },
        sad: {
          asset: "sad.png",
          intent: "",
        },
      },
      intentPatterns: [],
    };

    const errors = validateExpansionConfig(config,);

    expect(errors.filter((e,) => e.includes("empty intent",)).length,).toBe(2,);
  });
});
