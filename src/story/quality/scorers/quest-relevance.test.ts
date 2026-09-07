import { describe, expect, it, } from "bun:test";
import { scoreQuestRelevance, } from "../../../story/quality/scorers/quest-relevance";

describe("quality/scorers/quest-relevance (real logic)", () => {
  it("returns 60 when no quests", () => {
    expect(
      scoreQuestRelevance({ response: "hello", prompt: "", actorName: "", lore: null, quests: [], recentTurns: [], },),
    ).toBe(60,);
  });
  it("returns 60 when quests undefined", () => {
    expect(
      scoreQuestRelevance({
        response: "hello",
        prompt: "",
        actorName: "",
        lore: null,
        quests: null as any,
        recentTurns: [],
      },),
    ).toBe(60,);
  });
  it("adds score for matching quest name words", () => {
    const r = scoreQuestRelevance({
      response: "dragon treasure",
      prompt: "",
      actorName: "",
      lore: null,
      quests: [{ name: "Kill Dragon", progress: 0, target: 0, },],
      recentTurns: [],
    },);
    expect(r,).toBeGreaterThan(50,);
  });
  it("adds +10 for progress words", () => {
    const base = scoreQuestRelevance({
      response: "nothing",
      prompt: "",
      actorName: "",
      lore: null,
      quests: [{ name: "X", progress: 0, target: 0, },],
      recentTurns: [],
    },);
    const withProgress = scoreQuestRelevance({
      response: "found the item",
      prompt: "",
      actorName: "",
      lore: null,
      quests: [{ name: "X", progress: 0, target: 0, },],
      recentTurns: [],
    },);
    expect(withProgress,).toBeGreaterThan(base,);
  });
  it("ignores words <= 3 chars", () => {
    const r = scoreQuestRelevance({
      response: "a big dragon",
      prompt: "",
      actorName: "",
      lore: null,
      quests: [{ name: "Kill Dragon", progress: 0, target: 0, },],
      recentTurns: [],
    },);
    expect(r,).toBeGreaterThan(50,);
  });
});
