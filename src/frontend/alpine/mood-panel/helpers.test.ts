import { describe, expect, test, } from "bun:test";
import { happinessColor, moodToEmoji, moodToLabel, } from "./helpers";

describe("moodToEmoji", () => {
  test("maps every known mood", () => {
    expect(moodToEmoji("ecstatic",),).toBe("😄",);
    expect(moodToEmoji("happy",),).toBe("😊",);
    expect(moodToEmoji("neutral",),).toBe("😐",);
    expect(moodToEmoji("sad",),).toBe("😢",);
    expect(moodToEmoji("miserable",),).toBe("😞",);
  });

  test("falls back to neutral face for unknown moods", () => {
    expect(moodToEmoji("angry",),).toBe("😐",);
    expect(moodToEmoji("",),).toBe("😐",);
    expect(moodToEmoji("ECSTATIC",),).toBe("😐",);
  });
});

describe("moodToLabel", () => {
  test("maps every known mood", () => {
    expect(moodToLabel("ecstatic",),).toBe("Ecstatic",);
    expect(moodToLabel("happy",),).toBe("Happy",);
    expect(moodToLabel("neutral",),).toBe("Neutral",);
    expect(moodToLabel("sad",),).toBe("Sad",);
    expect(moodToLabel("miserable",),).toBe("Miserable",);
  });

  test("reports Unknown for unrecognized moods", () => {
    expect(moodToLabel("sleepy",),).toBe("Unknown",);
    expect(moodToLabel("",),).toBe("Unknown",);
  });
});

describe("happinessColor", () => {
  test("selects the bucket color at each threshold", () => {
    expect(happinessColor(100,),).toBe("var(--accent-green,)",);
    expect(happinessColor(80,),).toBe("var(--accent-green,)",);
    expect(happinessColor(79.9,),).toBe("var(--accent-blue,)",);
    expect(happinessColor(60,),).toBe("var(--accent-blue,)",);
    expect(happinessColor(45,),).toBe("var(--text-secondary,)",);
    expect(happinessColor(44,),).toBe("var(--accent-yellow,)",);
    expect(happinessColor(25,),).toBe("var(--accent-yellow,)",);
    expect(happinessColor(24,),).toBe("var(--accent-red,)",);
    expect(happinessColor(0,),).toBe("var(--accent-red,)",);
  });
});
