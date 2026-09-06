import { describe, expect, it, } from "bun:test";
import { scoreQuestRelevance, } from "../../../story/quality/scorers/quest-relevance";

describe("quality/scorers/quest-relevance (real logic)", () => {
  it("returns 60 when no quests", () => {
    expect(scoreQuestRelevance({ response: "hello", quests: [], },),).toBe(60,);
  });
  it("returns 60 when quests undefined", () => {
    expect(scoreQuestRelevance({ response: "hello", quests: null as any, },),).toBe(60,);
  });
  it("adds score for matching quest name words", () => {
    const r = scoreQuestRelevance({ response: "dragon treasure", quests: [{ name: "Kill Dragon", },], },);
    expect(r,).toBeGreaterThan(50,);
  });
  it("adds +10 for progress words", () => {
    const base = scoreQuestRelevance({ response: "nothing", quests: [{ name: "X", },], },);
    const withProgress = scoreQuestRelevance({ response: "found the item", quests: [{ name: "X", },], },);
    expect(withProgress,).toBeGreaterThan(base,);
  });
  it("ignores words <= 3 chars", () => {
    const r = scoreQuestRelevance({ response: "a big dog", quests: [{ name: "Kill Dragon", },], },);
    expect(r,).toBeGreaterThan(50,);
  });
});
