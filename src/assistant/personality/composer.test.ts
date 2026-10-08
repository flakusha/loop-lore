// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import {
  composePersonalityBlock,
  parsePersonalityBinding,
  parsePersonalitySource,
  resolvePersonalityState,
} from "./composer";
import { findPersonalityPreset, isPersonalityPresetKey, PERSONALITY_PRESETS, } from "./presets";
import type { AssistantPersonalityState, PersonalityPreset, } from "./types";

const db = {} as Kysely<DB>;

function state(source: AssistantPersonalityState["source"], driftScore = 0,): AssistantPersonalityState {
  return { chatId: "chat-1", source, lockedAt: null, driftScore, advisoryEnabled: true, };
}

describe("parsePersonalitySource", () => {
  test("accepts server-default", () => {
    expect(parsePersonalitySource({ kind: "server-default", },),).toEqual({ kind: "server-default", },);
  });

  test("accepts a known preset key", () => {
    expect(parsePersonalitySource({ kind: "preset", presetKey: "snarky", },),).toEqual({
      kind: "preset",
      presetKey: "snarky",
    },);
  });

  test("rejects an unknown preset key", () => {
    expect(parsePersonalitySource({ kind: "preset", presetKey: "bogus", },),).toBeNull();
  });

  test("accepts a character actor id", () => {
    expect(parsePersonalitySource({ kind: "character", actorId: "actor-9", },),).toEqual({
      kind: "character",
      actorId: "actor-9",
    },);
  });

  test("rejects null and unknown shapes", () => {
    expect(parsePersonalitySource(null,),).toBeNull();
    expect(parsePersonalitySource({ kind: "nope", },),).toBeNull();
  });
});

describe("parsePersonalityBinding", () => {
  test("parses a full binding", () => {
    expect(parsePersonalityBinding({
      source: { kind: "preset", presetKey: "fun", },
      lockedAt: 123,
      advisoryEnabled: false,
    },),).toEqual({
      source: { kind: "preset", presetKey: "fun", },
      lockedAt: 123,
      advisoryEnabled: false,
    },);
  });

  test("returns null for malformed input", () => {
    expect(parsePersonalityBinding(null,),).toBeNull();
    expect(parsePersonalityBinding("x",),).toBeNull();
    expect(parsePersonalityBinding({ source: { kind: "bogus", }, },),).toBeNull();
  });
});

describe("resolvePersonalityState", () => {
  test("falls back to server-default when no binding is stored", () => {
    const resolved = resolvePersonalityState("chat-1", null,);
    expect(resolved.source,).toEqual({ kind: "server-default", },);
    expect(resolved.lockedAt,).toBeNull();
  });

  test("reads the stored binding", () => {
    const resolved = resolvePersonalityState(
      "chat-1",
      JSON.stringify({ assistantPersonality: { source: { kind: "preset", presetKey: "stoic", }, lockedAt: 5, }, },),
    );

    expect(resolved.source,).toEqual({ kind: "preset", presetKey: "stoic", },);
    expect(resolved.lockedAt,).toBe(5,);
  });
});

describe("composePersonalityBlock", () => {
  test("emits nothing for server-default", async () => {
    expect(await composePersonalityBlock(db, state({ kind: "server-default", },),),).toBeNull();
  });

  test("emits the preset voice block", async () => {
    const block = await composePersonalityBlock(db, state({ kind: "preset", presetKey: "serious", },),);
    expect(block,).toContain("<assistant_personality>",);
    expect(block,).toContain("Serious",);
    expect(block,).toContain("Formality 3/4",);
  });

  test("appends a drift advisory above the threshold", async () => {
    const block = await composePersonalityBlock(db, state({ kind: "preset", presetKey: "fun", }, 0.9,),);
    expect(block,).toContain("Drift advisory",);
  });

  test("omits the advisory when disabled", async () => {
    const s = state({ kind: "preset", presetKey: "fun", }, 0.9,);
    s.advisoryEnabled = false;
    const block = await composePersonalityBlock(db, s,);
    expect(block,).not.toContain("Drift advisory",);
  });
});

describe("presets catalog", () => {
  test("ships the ten canonical presets", () => {
    expect(PERSONALITY_PRESETS.length,).toBe(10,);
    expect(PERSONALITY_PRESETS.map((p: PersonalityPreset,) => p.key),).toEqual([
      "serious",
      "helpful",
      "quirky",
      "fun",
      "melancholic",
      "snarky",
      "nurturing",
      "horror",
      "stoic",
      "ecstatic",
    ],);
  });

  test("every preset has voice dials, seeds and prompt blocks", () => {
    for (const preset of PERSONALITY_PRESETS) {
      expect(preset.voice.tone.length,).toBeGreaterThan(0,);
      expect(preset.voice.vocabularyHints.length,).toBeGreaterThan(0,);
      expect(preset.scenarioSeeds.length,).toBeGreaterThan(0,);
      expect(preset.promptBlocks.length,).toBeGreaterThan(0,);
      expect(preset.defaultMood.length,).toBeGreaterThan(0,);
    }
  });

  test("findPersonalityPreset + isPersonalityPresetKey agree", () => {
    expect(findPersonalityPreset("nurturing",)?.key,).toBe("nurturing",);
    expect(findPersonalityPreset("bogus",),).toBeUndefined();
    expect(isPersonalityPresetKey("horror",),).toBe(true,);
    expect(isPersonalityPresetKey("bogus",),).toBe(false,);
  });
});
