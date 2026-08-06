import { describe, expect, test, } from "bun:test";
import {
  COMMAND_PATTERNS,
  type CommandIntent,
  TAG_BACKGROUND,
  TAG_FACE,
  TAG_OBJECT,
} from "./image-edit";

// ── Helper ────────────────────────────────────────────────

/**
 * Match input against COMMAND_PATTERNS, returning highest-confidence match.
 * Mirrors parseEditCommand logic from image-edit-commands.ts.
 */
function matchIntent(
  text: string,
): { intent: CommandIntent; confidence: number } | null {
  let best: { intent: CommandIntent; confidence: number } | null = null;

  for (const { intent, patterns, confidence, } of COMMAND_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(text,)) {
        if (!best || confidence > best.confidence) {
          best = { intent, confidence, };
        }
        break;
      }
    }
  }

  return best;
}

// ── Background ────────────────────────────────────────────

describe("modify_background", () => {
  const cases = [
    "Make the background blurry",
    "Change the bg to a forest",
    "Replace background with mountains",
    "Swap the background",
    "New background",
    "Different bg",
    "Remove the background",
    "Clear background",
    "Set background to sunset",
    "Put the background as a beach",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      const result = matchIntent(input,);
      expect(result?.intent,).toBe("modify_background",);
    });
  }
});

// ── Add Object ────────────────────────────────────────────

describe("add_object", () => {
  const cases = [
    "Add a sword on the ground",
    "Place a cat near the door",
    "Insert a tree into the garden",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      const result = matchIntent(input,);
      expect(result?.intent,).toBe("add_object",);
    });
  }
});

// ── Remove Object ─────────────────────────────────────────

describe("remove_object", () => {
  const cases = [
    "Remove the sword",
    "Erase the stain",
    "Get rid of the tree",
    "Take out the chair",
    "Take away the hat",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      const result = matchIntent(input,);
      expect(result?.intent,).toBe("remove_object",);
    });
  }
});

// ── Apply Style (confidence 0.85) ─────────────────────────

describe("apply_style", () => {
  const cases = [
    "Apply anime style",
    "Use watercolor style",
    "Try realistic style",
    "Make it look like a painting",
    "In the style of Van Gogh",
    "Draw it like a cartoon",
    "Render in oil painting style",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      const result = matchIntent(input,);
      expect(result?.intent,).toBe("apply_style",);
    });
  }
});

// ── Adjust Mood (confidence 0.85) ─────────────────────────

describe("adjust_mood", () => {
  const cases = [
    "Make her look happy",
    "Make him look sad",
    "Make them seem angry",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      const result = matchIntent(input,);
      expect(result?.intent,).toBe("adjust_mood",);
    });
  }
});

// ── Change Hair (confidence 0.9) ──────────────────────────

describe("change_hair", () => {
  const cases = [
    "Change hairstyle to braids",
    "Make the hairstyle curly",
    "Color the hair purple",
    "Ponytail hairstyle",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      const result = matchIntent(input,);
      expect(result?.intent,).toBe("change_hair",);
    });
  }
});

// ── Change Outfit (confidence 0.9) ────────────────────────

describe("change_outfit", () => {
  const cases = [
    "Change clothes to armor",
    "Swap the costume",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      const result = matchIntent(input,);
      expect(result?.intent,).toBe("change_outfit",);
    });
  }
});

// ── Change Lighting (confidence 0.85) ─────────────────────

describe("change_lighting", () => {
  const cases = [
    "Adjust lighting to dramatic",
    "Set the lights to bright",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      const result = matchIntent(input,);
      expect(result?.intent,).toBe("change_lighting",);
    });
  }
});

// ── Change Pose (confidence 0.8) ──────────────────────────

describe("change_pose", () => {
  const cases = [
    "Set the position to sitting",
    "Make her stand",
    "Have the character fight",
    "Running pose",
    "Jumping stance",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      const result = matchIntent(input,);
      expect(result?.intent,).toBe("change_pose",);
    });
  }
});

// ── Upscale (confidence 0.9) ──────────────────────────────

describe("upscale", () => {
  const cases = [
    "Upscale the resolution",
    "Increase quality",
    "Make it 4K",
    "Get higher resolution",
    "Improve detail",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      const result = matchIntent(input,);
      expect(result?.intent,).toBe("upscale",);
    });
  }
});

// ── Negative Cases ────────────────────────────────────────

describe("no match", () => {
  const cases = [
    "Hello world",
    "What time is it",
    "Tell me a joke",
    "",
  ];

  for (const input of cases) {
    test(`does not match "${input}"`, () => {
      const result = matchIntent(input,);
      expect(result,).toBeNull();
    });
  }
});

// ── Confidence Scores ─────────────────────────────────────

describe("confidence", () => {
  test("modify_background has confidence 0.9", () => {
    const bg = COMMAND_PATTERNS.find((p,) => p.intent === "modify_background");
    expect(bg?.confidence,).toBeCloseTo(0.9, 10,);
  });

  test("upscale has confidence 0.9", () => {
    const up = COMMAND_PATTERNS.find((p,) => p.intent === "upscale");
    expect(up?.confidence,).toBeCloseTo(0.9, 10,);
  });

  test("add_accessory has confidence 0.7", () => {
    const acc = COMMAND_PATTERNS.find((p,) => p.intent === "add_accessory");
    expect(acc?.confidence,).toBeCloseTo(0.7, 10,);
  });
});

// ── Tag Patterns ──────────────────────────────────────────

describe("TAG_FACE", () => {
  test.each(["face", "portrait", "person", "Portrait", "FACE",],)(
    "matches %s",
    (tag,) => {
      expect(TAG_FACE.test(tag,),).toBe(true,);
    },
  );

  test.each(["landscape", "sky", "tree",],)(
    "does not match %s",
    (tag,) => {
      expect(TAG_FACE.test(tag,),).toBe(false,);
    },
  );
});

describe("TAG_BACKGROUND", () => {
  test.each(["background", "scene", "environment", "Scene",],)(
    "matches %s",
    (tag,) => {
      expect(TAG_BACKGROUND.test(tag,),).toBe(true,);
    },
  );

  test.each(["character", "face", "sword",],)(
    "does not match %s",
    (tag,) => {
      expect(TAG_BACKGROUND.test(tag,),).toBe(false,);
    },
  );
});

describe("TAG_OBJECT", () => {
  test.each(["object", "item", "prop", "Item",],)(
    "matches %s",
    (tag,) => {
      expect(TAG_OBJECT.test(tag,),).toBe(true,);
    },
  );

  test.each(["face", "background", "mood",],)(
    "does not match %s",
    (tag,) => {
      expect(TAG_OBJECT.test(tag,),).toBe(false,);
    },
  );
});

// ── Pattern count ─────────────────────────────────────────

describe("COMMAND_PATTERNS structure", () => {
  test("has 12 intent groups", () => {
    expect(COMMAND_PATTERNS.length,).toBe(12,);
  });

  test("every intent has at least 1 pattern", () => {
    for (const { patterns, } of COMMAND_PATTERNS) {
      expect(patterns.length,).toBeGreaterThanOrEqual(1,);
    }
  });

  test("all patterns are RegExp instances", () => {
    for (const { patterns, } of COMMAND_PATTERNS) {
      for (const p of patterns) {
        expect(p,).toBeInstanceOf(RegExp,);
      }
    }
  });
});
