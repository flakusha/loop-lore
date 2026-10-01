// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Behavior tests for the outfitContext prompt section. */
import { describe, expect, test, } from "bun:test";
import type { AssembleContext, } from "../types";
import { outfitContextSection, } from "./outfit-context";

function ctx(params: Record<string, string | undefined>,): AssembleContext {
  return { params, } as unknown as AssembleContext;
}

describe("outfitContextSection", () => {
  test("enabled only when an outfit is resolved", () => {
    expect(outfitContextSection.enabled(ctx({ outfit: "Court Dress", },),),).toBe(true,);
    expect(outfitContextSection.enabled(ctx({},),),).toBe(false,);
    expect(outfitContextSection.enabled(ctx({ emotion: "joy", },),),).toBe(false,);
  });

  test("build without an outfit is empty", async () => {
    expect(await outfitContextSection.build(ctx({},),),).toEqual([],);
  });

  test("build wraps the outfit name in outfit_context", async () => {
    const out = await outfitContextSection.build(ctx({ outfit: "Plate Armor", },),);
    expect(out.length,).toBe(1,);
    expect(out[0]?.role,).toBe("system",);
    expect(out[0]?.content,).toContain("outfit_context",);
    expect(out[0]?.content,).toContain("Current outfit: Plate Armor",);
  });

  test("build labels the resolution source when present", async () => {
    const out = await outfitContextSection.build(
      ctx({ outfit: "Court Dress", outfitSource: "chat_override", },),
    );
    const content = (out[0]?.content ?? "") as string;
    expect(content,).toContain("scene override",);
  });

  test("unknown source falls back to the raw value", async () => {
    const out = await outfitContextSection.build(
      ctx({ outfit: "Rags", outfitSource: "custom_source", },),
    );
    const content = (out[0]?.content ?? "") as string;
    expect(content,).toContain("custom_source",);
  });
});
