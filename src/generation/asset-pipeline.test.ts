// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { type AssetPipelineRequest, buildAssetPipeline, } from "./asset-pipeline";

const pipeline = buildAssetPipeline();

function req(over: Partial<AssetPipelineRequest>,): AssetPipelineRequest {
  return { kind: "item", name: "Iron Sword", description: "A battered blade.", ...over, };
}

describe("buildAssetPipeline", () => {
  test("kind → prompt mapping differs between item and location", () => {
    const item = pipeline.run(req({},),);
    const location = pipeline.run(req({ kind: "location", name: "Old Mill", },),);
    expect(item.imagePrompt,).toContain("Item concept art",);
    expect(location.imagePrompt,).toContain("Location concept art",);
    expect(item.imagePrompt,).not.toBe(location.imagePrompt,);
  });

  test("character maps to tts audio, item to sfx", () => {
    const character = pipeline.run(
      req({ kind: "character", name: "Mira", description: "A roguish scout.", },),
    );

    expect(character.audioPrompt,).toContain("Voice: Mira",);
    const item = pipeline.run(req({},),);
    expect(item.audioPrompt,).toContain("Sound effect",);
  });

  test("location audioPrompt is null (no per-entity audio template)", () => {
    const out = pipeline.run(req({ kind: "location", name: "Old Mill", },),);
    expect(out.audioPrompt,).toBeNull();
  });

  test("meta interpolation injects values and workflow tag", () => {
    const out = pipeline.run(
      req({ meta: { mood: "ominous", material: "iron", }, },),
    );

    expect(out.imagePrompt,).toContain("mood: ominous",);
    expect(out.imagePrompt,).toContain("material: iron",);
    expect(out.imagePrompt,).toContain("workflow: item:image",);
    expect(out.imagePrompt,).not.toContain("{{",);
  });

  test("unknown template tokens are dropped, not leaked", () => {
    const out = pipeline.run(req({ meta: { mood: "ominous", }, },),);
    expect(out.imagePrompt,).not.toContain("unknown",);
  });

  test("deterministic output", () => {
    const r = req({ meta: { mood: "grim", }, },);
    expect(pipeline.run(r,),).toEqual(pipeline.run(r,),);
  });

  test("@throws on unsupported kind", () => {
    expect(() => pipeline.run(req({ kind: "boss" as unknown as "item", },),)).toThrow(/Unsupported asset kind/,);
  });

  test("@throws on empty name", () => {
    expect(() => pipeline.run(req({ name: "  ", },),)).toThrow(/non-empty name/,);
  });
});
