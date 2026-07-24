import { describe, expect, it, } from "bun:test";
import {
  createTransition,
  detectTransitionType,
  isTransitionMessage,
  selectMessagesForPromotion,
} from "./transitions";
import type { MessageRef, } from "./types";

describe("isTransitionMessage", () => {
  it("detects movement verbs", () => {
    expect(isTransitionMessage("I walk to the tavern",),).toBe(true,);
    expect(isTransitionMessage("We move to the forest",),).toBe(true,);
    expect(isTransitionMessage("You go to the castle",),).toBe(true,);
    expect(isTransitionMessage("I travel north",),).toBe(true,);
  });

  it("detects scene change phrases", () => {
    expect(isTransitionMessage("The scene shifts to the marketplace",),).toBe(true,);
    expect(isTransitionMessage("Location changes to the dungeon",),).toBe(true,);
  });

  it("detects 'let's go to' pattern", () => {
    expect(isTransitionMessage("Let's go to the inn",),).toBe(true,);
    expect(isTransitionMessage("Let go to the inn",),).toBe(true,);
  });

  it("detects time skip patterns", () => {
    expect(isTransitionMessage("After a while, things changed",),).toBe(true,);
    expect(isTransitionMessage("After a long journey",),).toBe(true,);
  });

  it("returns false for regular messages", () => {
    expect(isTransitionMessage("Hello, how are you?",),).toBe(false,);
    expect(isTransitionMessage("I attack the dragon",),).toBe(false,);
    expect(isTransitionMessage("The weather is nice today",),).toBe(false,);
  });
});

describe("detectTransitionType", () => {
  it("returns location_change when hasLocationChange is true", () => {
    expect(detectTransitionType("anything", true,),).toBe("location_change",);
  });

  it("detects context cut", () => {
    expect(detectTransitionType("Skip ahead a few hours", false,),).toBe("context_cut",);
    expect(detectTransitionType("Context cut to the next day", false,),).toBe("context_cut",);
  });

  it("defaults to description", () => {
    expect(detectTransitionType("I walk to the tavern", false,),).toBe("description",);
  });
});

describe("createTransition", () => {
  it("creates a description transition", () => {
    const t = createTransition({
      actorId: "user-1",
      narration: "Walking to the tavern",
    },);

    expect(t.type,).toBe("description",);
    expect(t.actorId,).toBe("user-1",);
    expect(t.narration,).toBe("Walking to the tavern",);
    expect(t.promotedMemoryIds,).toEqual([],);
    expect(t.createdAt,).toBeTruthy();
  });

  it("creates a location change transition", () => {
    const t = createTransition({
      actorId: "user-1",
      newLocationId: "loc-1",
    },);

    expect(t.type,).toBe("location_change",);
    expect(t.newLocationId,).toBe("loc-1",);
  });

  it("includes promoted memory IDs", () => {
    const t = createTransition({
      actorId: "user-1",
      promotedMemoryIds: ["mem-1", "mem-2",],
    },);

    expect(t.promotedMemoryIds,).toEqual(["mem-1", "mem-2",],);
  });
});

describe("selectMessagesForPromotion", () => {
  function makeMsg(id: string, content: string, score?: number,): MessageRef {
    return {
      messageId: id,
      role: "user",
      content,
      tokenCount: Math.ceil(content.length * 0.3,),
      createdAt: new Date().toISOString(),
      score,
    };
  }

  it("returns empty when under budget", () => {
    const msgs = [makeMsg("1", "Short message",),];
    const result = selectMessagesForPromotion(msgs, 10_000,);
    expect(result,).toEqual([],);
  });

  it("promotes messages over budget that meet score threshold", () => {
    const msgs: MessageRef[] = [
      { messageId: "1", role: "user", content: "x".repeat(1000,), tokenCount: 300, createdAt: "", score: 0.2, },
      { messageId: "2", role: "user", content: "y".repeat(1000,), tokenCount: 300, createdAt: "", score: 0.8, },
      { messageId: "3", role: "user", content: "z".repeat(1000,), tokenCount: 300, createdAt: "", score: 0.1, },
    ];
    // With maxTokens=100, all messages are over budget
    // High-score messages (>=0.6) get promoted, low-score ones don't
    const result = selectMessagesForPromotion(msgs, 100, 0.6,);
    expect(result,).toContain("2",); // high score gets promoted
    expect(result,).not.toContain("1",); // low score not promoted
    expect(result,).not.toContain("3",); // low score not promoted
  });

  it("uses length heuristic when score is absent", () => {
    const msgs = [
      makeMsg("1", "x".repeat(300,),), // long, no score → heuristic
      makeMsg("2", "short",), // short, no score → heuristic
    ];
    const result = selectMessagesForPromotion(msgs, 10, 0.6,);
    expect(result.length,).toBeGreaterThan(0,);
  });
});
