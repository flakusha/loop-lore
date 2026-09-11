// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for the post-history prompt section. */
import { describe, expect, test, } from "bun:test";
import type { AssembleContext, } from "../types";
import { postHistorySection, } from "./post-history";

function ctx(instructions: string | null,): AssembleContext {
  return { actor: { post_history_instructions: instructions, }, } as AssembleContext;
}

describe("postHistorySection", () => {
  test("enabled only with instructions present", () => {
    expect(postHistorySection.enabled(ctx("Stay in voice.",),),).toBe(true,);
    expect(postHistorySection.enabled(ctx(null,),),).toBe(false,);
    expect(postHistorySection.enabled(ctx("",),),).toBe(false,);
  });

  test("build wraps instructions as a trailing user message", async () => {
    const out = await postHistorySection.build(ctx("Stay in voice.",),);
    expect(out.length,).toBe(1,);
    expect(out[0]?.role,).toBe("user",);
    expect(out[0]?.content as string,).toContain("Stay in voice.",);
  });

  test("build without instructions is empty", async () => {
    expect(await postHistorySection.build(ctx(null,),),).toEqual([],);
  });
});
