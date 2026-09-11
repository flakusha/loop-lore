// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for the emotion-avatar prompt section. */
import { describe, expect, test, } from "bun:test";
import type { AssembleContext, } from "../types";
import { emotionAvatarSection, } from "./emotion-avatar";

function ctx(params: Record<string, string | undefined>,): AssembleContext {
  return { params, } as unknown as AssembleContext;
}

describe("emotionAvatarSection", () => {
  test("enabled only with emotion params", () => {
    expect(emotionAvatarSection.enabled(ctx({ emotion: "joy", }),),).toBe(true,);
    expect(emotionAvatarSection.enabled(ctx({ emotionAvatar: "joy.png", }),),).toBe(true,);
    expect(emotionAvatarSection.enabled(ctx({},),),).toBe(false,);
  });

  test("build without emotion is empty", async () => {
    expect(await emotionAvatarSection.build(ctx({},),),).toEqual([],);
  });

  test("build joins state and asset into one system message", async () => {
    const out = await emotionAvatarSection.build(
      ctx({ emotion: "melancholy", emotionAvatar: "blue.png", },),
    );
    expect(out.length,).toBe(1,);
    expect(out[0]?.role,).toBe("system",);
    const content = out[0]?.content as string;
    expect(content,).toContain("Current emotional state: melancholy",);
    expect(content,).toContain("Emotion avatar asset in use: blue.png",);
  });

  test("build with only the asset omits the state line", async () => {
    const out = await emotionAvatarSection.build(ctx({ emotionAvatar: "blue.png", },),);
    const content = (out[0]?.content ?? "") as string;
    expect(content,).not.toContain("Current emotional state",);
    expect(content,).toContain("Emotion avatar asset in use: blue.png",);
  });
});
