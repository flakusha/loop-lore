// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for frontend/vn/stage-directives.ts — derivation of enter/exit/swap
 * from scene transitions and roster application with graceful no-ops.
 */
import { describe, expect, test, } from "bun:test";
import { createRoster, } from "./sprite-stage";
import {
  applyStageDirectives,
  deriveStageDirectives,
  type SceneCastView,
} from "./stage-directives";

function view(cast: string[], speakerId?: string | null, emotion?: string,): SceneCastView {
  return {
    cast: cast.map((id,) => ({ characterId: id, name: id, })),
    speakerId,
    emotion,
  };
}

function visibleIds(ids: string[], hidden: string[] = [],) {
  return createRoster(ids.map((id,) => ({
    characterId: id,
    name: id,
    visible: !hidden.includes(id,),
  })),);
}

describe("deriveStageDirectives", () => {
  test("first scene enters the cast and swaps the speaker expression", () => {
    expect(deriveStageDirectives(null, view(["rin", "kai",], "rin", "happy",),),).toEqual([
      { kind: "enter", characterId: "rin", },
      { kind: "enter", characterId: "kai", },
      { kind: "swap", characterId: "rin", emotion: "happy", },
    ],);
  });

  test("identical consecutive scenes derive nothing", () => {
    const prev = view(["rin",], "rin", "happy",);
    expect(deriveStageDirectives(prev, view(["rin",], "rin", "happy",),),).toEqual([],);
  });

  test("emotion change on the same speaker swaps", () => {
    const prev = view(["rin",], "rin", "neutral",);
    expect(deriveStageDirectives(prev, view(["rin",], "rin", "sad",),),).toEqual([
      { kind: "swap", characterId: "rin", emotion: "sad", },
    ],);
  });

  test("speaker change establishes the new speaker expression", () => {
    const prev = view(["rin", "kai",], "rin", "happy",);
    expect(deriveStageDirectives(prev, view(["rin", "kai",], "kai", "angry",),),).toEqual([
      { kind: "swap", characterId: "kai", emotion: "angry", },
    ],);
  });

  test("cast deltas enter and exit members", () => {
    const prev = view(["rin", "kai",], "rin",);
    expect(deriveStageDirectives(prev, view(["kai", "moe",], "kai",),),).toEqual([
      { kind: "enter", characterId: "moe", },
      { kind: "exit", characterId: "rin", },
    ],);
  });

  test("narration exits the cast without swapping", () => {
    const prev = view(["rin", "kai",], "rin", "happy",);
    expect(deriveStageDirectives(prev, view([], null,),),).toEqual([
      { kind: "exit", characterId: "rin", },
      { kind: "exit", characterId: "kai", },
    ],);
  });

  test("swap needs an in-cast speaker with an emotion", () => {
    expect(deriveStageDirectives(null, view(["rin",], "rin",),),).toEqual([
      { kind: "enter", characterId: "rin", },
    ],);
    expect(deriveStageDirectives(null, view(["rin",], "ghost", "happy",),),).toEqual([
      { kind: "enter", characterId: "rin", },
    ],);
    expect(deriveStageDirectives(null, view([], null, "happy",),),).toEqual([],);
  });
});

describe("applyStageDirectives", () => {
  test("enter reveals and exit hides members", () => {
    const roster = visibleIds(["rin", "kai",], ["kai",],);
    applyStageDirectives(roster, [
      { kind: "enter", characterId: "kai", },
      { kind: "exit", characterId: "rin", },
    ],);
    expect(roster.entries.find((e,) => e.characterId === "kai")?.visible,).toBe(true,);
    expect(roster.entries.find((e,) => e.characterId === "rin")?.visible,).toBe(false,);
  });

  test("unknown ids are no-ops and swap never touches the roster", () => {
    const roster = visibleIds(["rin",],);
    applyStageDirectives(roster, [
      { kind: "enter", characterId: "ghost", },
      { kind: "exit", characterId: "ghost", },
      { kind: "swap", characterId: "rin", emotion: "happy", },
    ],);
    expect(roster.entries,).toHaveLength(1,);
    expect(roster.entries[0]?.visible,).toBe(true,);
  });

  test("a message stream leaves only the latest cast on stage", () => {
    const roster = createRoster();
    let prev: SceneCastView | null = null;
    for (const scene of [view(["rin",], "rin", "happy",), view(["kai",], "kai", "sad",),]) {
      for (const member of scene.cast ?? []) {
        const known = roster.entries.some((e,) => e.characterId === member.characterId);
        if (!known) { roster.entries.push({ ...member, visible: true, },); }
      }
      applyStageDirectives(roster, deriveStageDirectives(prev, scene,),);
      prev = scene;
    }
    expect(roster.entries.find((e,) => e.characterId === "rin")?.visible,).toBe(false,);
    expect(roster.entries.find((e,) => e.characterId === "kai")?.visible,).toBe(true,);
  });
});
