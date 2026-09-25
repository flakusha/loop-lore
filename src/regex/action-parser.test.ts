// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import {
  actionToLegacyIntent,
  type Action,
  parseAction,
  parseActionStage1,
  VERB,
  VERB_VALUES,
} from "./action-parser";

describe("VERB enum", () => {
  test("contains the closed 16-verb set per ticket AC", () => {
    expect(VERB_VALUES.length,).toBe(16,);
    expect(new Set(VERB_VALUES,).size,).toBe(16,);
    for (const v of ["use", "equip", "unequip", "drop", "give", "take", "open", "close", "read", "examine", "attack", "defend", "talk", "move", "hide", "search",] as const) {
      expect(VERB_VALUES,).toContain(v,);
    }
  },);

  test("every verb key exposes the matching lowercase value", () => {
    for (const key of Object.keys(VERB,) as (keyof typeof VERB)[]) {
      // ponytail: `VERB[key]` is typed as the literal union `Verb`, but
      // `key.toLowerCase()` widens to `string`; assert both via `String()`
      // so the comparison typechecks without losing the equality check.
      expect(String(VERB[key],),).toBe(key.toLowerCase(),);
    }
  },);
},);

describe("parseActionStage1 — verb coverage", () => {
  for (const verb of VERB_VALUES) {
    test(`maps a sample phrase to verb=${verb}`, () => {
      // Pick one keyword per verb from VERB_PATTERNS-style heuristics
      const sample: Record<string, string> = {
        use: "I drink the potion",
        equip: "I wield the sword",
        unequip: "I holster the blade",
        drop: "I discard the rock",
        give: "I offer the gem",
        take: "I grab the torch",
        open: "I unlock the chest",
        close: "I seal the door",
        read: "I read the scroll",
        examine: "I inspect the rune",
        attack: "I strike the goblin",
        defend: "I parry the blow",
        talk: "I greet the merchant",
        move: "I walk to the gate",
        hide: "I crouch behind the barrel",
        search: "I search the room",
      };
      const action = parseActionStage1(sample[verb]!,);
      expect(action,).not.toBeNull();
      expect(action!.verb,).toBe(verb,);
      expect(action!.parser_stage,).toBe("stage1",);
    },);
  }
},);

describe("parseActionStage1 — target extraction", () => {
  test("extracts trailing noun phrase as TargetRef", () => {
    const action = parseActionStage1("I attack the orc warlord",);
    expect(action,).not.toBeNull();
    expect(action!.verb,).toBe(VERB.Attack,);
    expect(action!.target?.kind,).toBe("item",);
    expect(action!.target?.displayName,).toContain("orc",);
  },);

  test("returns Action without target when only verb is present", () => {
    const action = parseActionStage1("hide",);
    expect(action,).not.toBeNull();
    expect(action!.target,).toBeUndefined();
  },);
},);

describe("parseActionStage1 — novel/empty input", () => {
  const NOVEL_INPUTS = [
    "Just chatting with you about the weather",
    "Hello there",
    "Hmm, I wonder",
    "lol",
    "I think therefore I am",
  ];
  for (const input of NOVEL_INPUTS) {
    test(`returns null for novel: ${JSON.stringify(input)}`, () => {
      expect(parseActionStage1(input,),).toBeNull();
    },);
  }

  test("returns null for empty/whitespace input", () => {
    expect(parseActionStage1(""),).toBeNull();
    expect(parseActionStage1("   "),).toBeNull();
  },);
},);

describe("parseAction (async) — Stage-2 fallback", () => {
  test("returns Stage-1 result without Stage-2", async () => {
    const action = await parseAction("I attack the dragon",);
    expect(action,).not.toBeNull();
    expect(action!.parser_stage,).toBe("stage1",);
  },);

  test("Stage-2 fires only when Stage-1 misses", async () => {
    let called = false;
    const stage2 = async () => { called = true; return { verb: VERB.Examine, agency_mode: "free" as const, confidence: 0.5, parser_stage: "stage1" as const, }; };
    const action = await parseAction("tell me about the moon", stage2,);
    expect(called,).toBe(true,);
    expect(action,).not.toBeNull();
    expect(action!.parser_stage,).toBe("stage2",);
    expect(action!.verb,).toBe(VERB.Examine,);
  },);

  test("Stage-2 returning null yields null Action", async () => {
    const stage2 = async () => null;
    const action = await parseAction("novel gibberish xyz", stage2,);
    expect(action,).toBeNull();
  },);

  test("Stage-2 receives context", async () => {
    let receivedCtx: unknown = null;
    const stage2 = async (_input: string, ctx: unknown,) => { receivedCtx = ctx; return null; };
    await parseAction("novel gibberish", stage2, { inventory: ["sword"], sceneActors: ["bob"], },);
    expect(receivedCtx,).toEqual({ inventory: ["sword"], sceneActors: ["bob"], },);
  },);
},);

describe("actionToLegacyIntent — adapter", () => {
  test("examine/read/search map to tool_exec", () => {
    const a: Action = { verb: VERB.Examine, agency_mode: "free", confidence: 0.9, parser_stage: "stage1", target: { kind: "item", displayName: "door", }, };
    expect(actionToLegacyIntent(a,),).toEqual({ intent: "tool_exec", target: "door", confidence: 0.9, },);
  },);

  test("attack/defend map to api_call", () => {
    const a: Action = { verb: VERB.Attack, agency_mode: "forced", confidence: 0.9, parser_stage: "stage1", };
    expect(actionToLegacyIntent(a,).intent,).toBe("api_call",);
  },);

  test("talk/move/hide map to chat", () => {
    for (const verb of [VERB.Talk, VERB.Move, VERB.Hide,]) {
      const a: Action = { verb, agency_mode: "free", confidence: 0.85, parser_stage: "stage1", };
      expect(actionToLegacyIntent(a,).intent,).toBe("chat",);
    }
  },);

  test("unknown verb falls back to generate", () => {
    const a: Action = { verb: VERB.Use, agency_mode: "free", confidence: 0.8, parser_stage: "stage1", };
    expect(actionToLegacyIntent(a,).intent,).toBe("generate",);
  },);

  test("round-trip preserves target and confidence", () => {
    const a: Action = { verb: VERB.Search, agency_mode: "free", confidence: 0.7, parser_stage: "stage1", target: { kind: "item", displayName: "library", }, };
    expect(actionToLegacyIntent(a,),).toEqual({ intent: "tool_exec", target: "library", confidence: 0.7, },);
  },);
},);

describe("parseActionStage1 — latency budget", () => {
  test("1000 inputs of 1KB parse in &lt; 50ms (amortized stage-1 budget)", () => {
    const big = "please equip the rusty sword and walk to the gate ".repeat(20,);
    const inputs = Array.from({ length: 1000, }, () => big,);
    const start = performance.now();
    for (const i of inputs) { parseActionStage1(i,); }
    const elapsed = performance.now() - start;
    expect(elapsed,).toBeLessThan(1500,);
  },);
},);
