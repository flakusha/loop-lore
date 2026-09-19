// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Constructor override behavior tests for GenerationSection. */
import { describe, expect, test, } from "bun:test";
import { GenerationSection, } from "./section";

describe("GenerationSection", () => {
  test("defaults hold when constructed without overrides", () => {
    const section = new GenerationSection();
    expect(section.matting,).toBeUndefined();
    expect(section.providers.openaiCompatible,).toEqual([],);
  });

  test("override merges providers and assigns the matting section", () => {
    const section = new GenerationSection({
      matting: { backend: "auto", endpoint: "http://127.0.0.1:7000", },
      providers: { openaiCompatible: [{ name: "x", baseUrl: "http://x", },], } as never,
    },);
    expect(section.matting?.backend,).toBe("auto",);
    expect(section.providers.openaiCompatible,).toHaveLength(1,);
  });
});
