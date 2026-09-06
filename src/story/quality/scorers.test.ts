/**
 * Story Quality Scorer Tests
 *
 * Pins overlap bonuses, voice markers, and score clamps.
 */
import { describe, expect, it, } from "bun:test";
import { scoreCharacterVoice, } from "./scorers/character-voice.js";
import { scoreCreativity, } from "./scorers/creativity.js";
import { scoreNarrativeQuality, } from "./scorers/narrative-quality.js";
import { scorePlotCoherence, } from "./scorers/plot-coherence.js";
import { type ScorerContext, } from "./types.js";

function ctx(response: string, prompt = "",): ScorerContext {
  return { response, prompt, actorName: "A", lore: null, quests: [], recentTurns: [], };
}

describe("scorePlotCoherence", () => {
  const prompt = "dragon mountain ancient kingdom";
  it("rewards full overlap plus flow markers", () => {
    const s = scorePlotCoherence(ctx("The dragon left the mountain because the ancient kingdom fell.", prompt,),);
    expect(s,).toBe(90,);
  });
  it("penalizes contradictions", () => {
    const plain = scorePlotCoherence(ctx("The dragon left the mountain and the ancient kingdom fell.", prompt,),);
    const contra = scorePlotCoherence(ctx("The dragon left the mountain however the ancient kingdom fell.", prompt,),);
    expect(contra,).toBe(plain - 2,);
  });
});
describe("scoreCharacterVoice", () => {
  it("rewards dialogue, action, and first person", () => {
    const s = scoreCharacterVoice(
      ctx(`"Hello there," I said *waving my hand* as we walked down the long dusty road together`,),
    );
    expect(s,).toBe(90,);
  });
  it("penalizes very short responses", () => {
    expect(scoreCharacterVoice(ctx("Hi.",),),).toBe(55,);
  });
});

describe("scoreCreativity", () => {
  it("rewards evocative words", () => {
    expect(scoreCreativity(ctx("A mysterious ancient shadow crossed the forgotten hall.",),),).toBe(85,);
  });
  it("penalizes cliches", () => {
    const plain = scoreCreativity(ctx("The knight entered the hall.",),);
    const cliche = scoreCreativity(ctx("The knight entered the hall and it was all a dream.",),);
    expect(cliche,).toBe(plain - 15,);
  });
});

describe("scoreNarrativeQuality", () => {
  it("penalizes very short responses", () => {
    expect(scoreNarrativeQuality(ctx("Hi there.",),),).toBe(40,);
  });
  it("rewards ideal length", () => {
    const words = Array.from({ length: 120, }, () => "plain",).join(" ",);
    expect(scoreNarrativeQuality(ctx(words,),),).toBe(75,);
  });
});
