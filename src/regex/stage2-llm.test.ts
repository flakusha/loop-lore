// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Stage-2 LLM fallback wiring tests. The generation seam is injected, so
 * these cover the contract that matters offline: constrained-schema
 * validation and reject-on-invalid.
 */
import { describe, expect, test, } from "bun:test";
import { parseAction, VERB, } from "./action-parser";
import { createStage2Parser, MAX_STAGE2_RAW_CHARS, MAX_STAGE2_REF_CHARS, validateStage2Output, } from "./stage2-llm";

const CTX = { inventory: ["iron sword", "health potion",], sceneActors: ["orc warlord",], };

/** JSON for a valid stage-2 action targeting the sword. */
const VALID = JSON.stringify({
  verb: "attack",
  target: { kind: "item", displayName: "iron sword", },
  confidence: 0.8,
},);

describe("validateStage2Output — constrained schema", () => {
  test("a valid completion parses to a stage-2 action", () => {
    const action = validateStage2Output(VALID, CTX,);
    expect(action,).not.toBeNull();
    expect(action!.verb,).toBe(VERB.Attack,);
    expect(action!.parser_stage,).toBe("stage2",);
    expect(action!.agency_mode,).toBe("free",);
    expect(action!.target?.displayName,).toBe("iron sword",);
  });

  test("unparsable JSON is rejected", () => {
    expect(validateStage2Output("not json at all", CTX,),).toBeNull();
  });

  test("a verb outside the closed enum is rejected", () => {
    expect(validateStage2Output(JSON.stringify({ verb: "teleport", },), CTX,),).toBeNull();
  });

  test("a non-object payload is rejected", () => {
    expect(validateStage2Output(JSON.stringify([1, 2,],), CTX,),).toBeNull();
    expect(validateStage2Output("null", CTX,),).toBeNull();
  });

  test("a target outside inventory ∪ scene actors is rejected", () => {
    const raw = JSON.stringify({
      verb: "use",
      target: { kind: "item", displayName: "wand of nowhere", },
    },);

    expect(validateStage2Output(raw, CTX,),).toBeNull();
  });

  test("an actor-kind target may name a scene actor", () => {
    const raw = JSON.stringify({
      verb: "talk",
      target: { kind: "actor", displayName: "Orc Warlord", },
    },);

    const action = validateStage2Output(raw, CTX,);
    expect(action?.target?.displayName,).toBe("Orc Warlord",);
  });

  test("an instrument outside the inventory is rejected", () => {
    const raw = JSON.stringify({
      verb: "attack",
      instrument: { kind: "item", displayName: "orc warlord", },
    },);

    expect(validateStage2Output(raw, CTX,),).toBeNull();
  });

  test("a malformed ref shape is rejected", () => {
    expect(validateStage2Output(JSON.stringify({ verb: "use", target: { kind: "exit", }, },), CTX,),).toBeNull();
    expect(validateStage2Output(JSON.stringify({ verb: "use", target: 7, },), CTX,),).toBeNull();
  });

  test("an out-of-range confidence falls back to the default instead of rejecting", () => {
    const action = validateStage2Output(JSON.stringify({ verb: "search", confidence: 42, },), CTX,);
    expect(action?.confidence,).toBe(0.5,);
  });

  test("an oversized completion is rejected outright", () => {
    const bloated = JSON.stringify({ verb: "search", note: "x".repeat(MAX_STAGE2_RAW_CHARS,), },);
    expect(bloated.length,).toBeGreaterThan(MAX_STAGE2_RAW_CHARS,);
    expect(validateStage2Output(bloated, CTX,),).toBeNull();
  });

  test("an oversized displayName is rejected", () => {
    const raw = JSON.stringify({
      verb: "use",
      target: { kind: "item", displayName: "x".repeat(MAX_STAGE2_REF_CHARS + 1,), },
    },);

    expect(validateStage2Output(raw, CTX,),).toBeNull();
  });
});

describe("createStage2Parser — fallback wiring", () => {
  test("routes the stage-1 miss through the injected generator", async () => {
    const seen: string[] = [];
    const stage2 = createStage2Parser({
      db: null as never,
      generate: async ({ messages, },) => {
        seen.push(messages.map((m,) => m.content).join("\n",),);
        return VALID;
      },
    },);

    const action = await parseAction("do the thing with the iron sword", stage2, CTX,);
    expect(action?.parser_stage,).toBe("stage2",);
    expect(action?.target?.displayName,).toBe("iron sword",);
    expect(seen[0],).toContain("iron sword",);
    expect(seen[0],).toContain("attack",);
  });

  test("a schema-violating completion yields a null action, not a crash", async () => {
    const stage2 = createStage2Parser({
      db: null as never,
      generate: async () => '{"verb": "conjure"}',
    },);

    expect(await parseAction("novel gibberish xyz", stage2, CTX,),).toBeNull();
  });

  test("a generation failure degrades to null", async () => {
    const stage2 = createStage2Parser({
      db: null as never,
      generate: async () => {
        throw new Error("provider 503",);
      },
    },);

    expect(await parseAction("novel gibberish xyz", stage2, CTX,),).toBeNull();
  });

  test("a stage-1 hit never reaches the generator", async () => {
    let calls = 0;
    const stage2 = createStage2Parser({
      db: null as never,
      generate: async () => {
        calls += 1;
        return VALID;
      },
    },);

    const action = await parseAction("I attack the dragon", stage2, CTX,);
    expect(calls,).toBe(0,);
    expect(action?.parser_stage,).toBe("stage1",);
  });
});
