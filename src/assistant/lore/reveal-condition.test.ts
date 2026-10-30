/**
 * reveal-condition unit tests — epic-lore-knowledge secret-lore gating.
 *
 * Covers the pure surface only: parsing/validation (fail-closed conventions),
 * the `event`-leaf detector used by `lore-load`, and evaluation against
 * conversation + timeline ground truth. Section-level integration lives in
 * `prompt/sections/lore-reveal.test.ts`.
 */
import { describe, expect, test, } from "bun:test";
import {
  hasRevealCondition,
  parseRevealCondition,
  revealConditionMet,
  revealConditionNeedsEvents,
  type RevealContext,
} from "./reveal-condition";

/** Empty ground truth — no conversation words, no timeline events. */
function emptyCtx(): RevealContext {
  return { words: new Set<string>(), timelineEventTypes: new Set<string>(), timelineEventText: "", };
}

/** Ground truth with conversation words and timeline events. */
function ctx(
  words: string[],
  eventTypes: string[] = [],
  eventText = "",
): RevealContext {
  return {
    words: new Set(words,),
    timelineEventTypes: new Set(eventTypes,),
    timelineEventText: eventText,
  };
}

describe("hasRevealCondition", () => {
  test("null, undefined, blank, and whitespace are not secret", () => {
    expect(hasRevealCondition(null,),).toBe(false,);
    expect(hasRevealCondition(undefined,),).toBe(false,);
    expect(hasRevealCondition("",),).toBe(false,);
    expect(hasRevealCondition("   ",),).toBe(false,);
  });

  test("any non-blank string is secret", () => {
    expect(hasRevealCondition("{}",),).toBe(true,);
    expect(hasRevealCondition("not-json",),).toBe(true,);
  });
});

describe("parseRevealCondition", () => {
  test("absent and blank parse to null (not secret)", () => {
    expect(parseRevealCondition(null,),).toBeNull();
    expect(parseRevealCondition(undefined,),).toBeNull();
    expect(parseRevealCondition("  ",),).toBeNull();
  });

  test("malformed JSON parses to null (caller fails closed)", () => {
    expect(parseRevealCondition("not-json",),).toBeNull();
  });

  test("non-object JSON parses to null", () => {
    expect(parseRevealCondition(JSON.stringify(["beacon",],),),).toBeNull();
    expect(parseRevealCondition("42",),).toBeNull();
    expect(parseRevealCondition('"text"',),).toBeNull();
    expect(parseRevealCondition("null",),).toBeNull();
  });

  test("well-formed trees parse, unknown keys ignored", () => {
    const raw = JSON.stringify({
      all: [{ keywords: ["beacon",], },],
      any: [{ event: "meteor", },],
      keywords: ["crown",],
      event: "coronation",
      junk: true,
    },);

    expect(parseRevealCondition(raw,),).toEqual({
      all: [{ keywords: ["beacon",], },],
      any: [{ event: "meteor", },],
      keywords: ["crown",],
      event: "coronation",
    },);
  });

  test("wrong leaf shapes are invalid", () => {
    expect(parseRevealCondition(JSON.stringify({ keywords: "beacon", },),),).toBeNull();
    expect(parseRevealCondition(JSON.stringify({ keywords: [1,], },),),).toBeNull();
    expect(parseRevealCondition(JSON.stringify({ event: 7, },),),).toBeNull();
    expect(parseRevealCondition(JSON.stringify({ all: "x", },),),).toBeNull();
    expect(parseRevealCondition(JSON.stringify({ all: ["bad",], },),),).toBeNull();
  });

  test("nesting beyond MAX_REVEAL_DEPTH is invalid (fail closed)", () => {
    let deep: Record<string, unknown> = { keywords: ["x",], };
    for (let i = 0; i < 12; i++) { deep = { all: [deep,], }; }
    expect(parseRevealCondition(JSON.stringify(deep,),),).toBeNull();
  });
});

describe("revealConditionNeedsEvents", () => {
  test("event leaves are detected at any depth", () => {
    expect(revealConditionNeedsEvents({ event: "meteor", },),).toBe(true,);
    expect(revealConditionNeedsEvents({ all: [{ any: [{ event: "e", },], },], },),).toBe(true,);
  });

  test("keyword-only trees need no events", () => {
    expect(revealConditionNeedsEvents({ keywords: ["x",], },),).toBe(false,);
    expect(revealConditionNeedsEvents({ all: [{ keywords: ["x",], },], },),).toBe(false,);
    expect(revealConditionNeedsEvents({},),).toBe(false,);
  });
});

describe("revealConditionMet", () => {
  test("empty condition is vacuously met", () => {
    expect(revealConditionMet({}, emptyCtx(),),).toBe(true,);
  });

  test("keywords match case-insensitively against the word set", () => {
    const cond = { keywords: ["Beacon",], };
    expect(revealConditionMet(cond, ctx(["beacon", "lit",],),),).toBe(true,);
    expect(revealConditionMet(cond, ctx(["torch", "lit",],),),).toBe(false,);
  });

  test("empty keywords array imposes no constraint", () => {
    expect(revealConditionMet({ keywords: [], }, emptyCtx(),),).toBe(true,);
  });

  test("event matches by event_type or description substring", () => {
    const cond = { event: "meteor_fall", };
    expect(revealConditionMet(cond, ctx([], ["meteor_fall",],),),).toBe(true,);
    expect(revealConditionMet(cond, ctx([], [], "a great meteor_fall was seen",),),).toBe(true,);
    expect(revealConditionMet(cond, ctx([], ["earthquake",], "the ground shook",),),).toBe(false,);
  });

  test("blank event leaf imposes no constraint", () => {
    expect(revealConditionMet({ event: "  ", }, emptyCtx(),),).toBe(true,);
  });

  test("all requires every sub-condition", () => {
    const cond = { all: [{ keywords: ["beacon",], }, { event: "meteor", },], };
    expect(revealConditionMet(cond, ctx(["beacon",], ["meteor",],),),).toBe(true,);
    expect(revealConditionMet(cond, ctx(["beacon",],),),).toBe(false,);
    expect(revealConditionMet(cond, ctx([], ["meteor",],),),).toBe(false,);
  });

  test("any requires at least one sub-condition", () => {
    const cond = { any: [{ keywords: ["beacon",], }, { event: "meteor", },], };
    expect(revealConditionMet(cond, ctx(["beacon",],),),).toBe(true,);
    expect(revealConditionMet(cond, ctx([], [], "meteor over the bay",),),).toBe(true,);
    expect(revealConditionMet(cond, ctx([], [],),),).toBe(false,);
  });

  test("nested combinators compose", () => {
    const cond = {
      all: [
        { any: [{ keywords: ["beacon",], }, { keywords: ["horn",], },], },
        { event: "meteor", },
      ],
    };

    expect(revealConditionMet(cond, ctx(["horn",], ["meteor",],),),).toBe(true,);
    expect(revealConditionMet(cond, ctx(["horn",],),),).toBe(false,);
  });
});
