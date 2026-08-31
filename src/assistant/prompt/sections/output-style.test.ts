// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import type { OutputStyleConfig, } from "../../../chat/output-style";
import type { AssembleContext, } from "../types";
import { styleSection, } from "./output-style";

/**
 * @param style
 */
function ctxWith(style: OutputStyleConfig | null,): AssembleContext {
  return {
    db: {} as never,
    actor: {} as never,
    chat: {} as never,
    params: {} as never,
    isStory: false,
    tokenBudget: 32000,
    outputStyle: style,
    responseLength: null,
  } as AssembleContext;
}

describe("styleSection", () => {
  test("disabled when no style resolved", () => {
    expect(styleSection.enabled(ctxWith(null,),),).toBe(false,);
  });

  test("enabled when style resolved", () => {
    expect(styleSection.enabled(ctxWith({ preset: "noir", intensity: 0.5, },),),).toBe(true,);
  });

  test("emits an XML-wrapped system message", async () => {
    const msgs = await styleSection.build(ctxWith({ preset: "cyberpunk", intensity: 0.8, },),);
    expect(msgs,).toHaveLength(1,);
    expect(msgs[0]?.role,).toBe("system",);
    expect(msgs[0]?.content,).toContain("<output_style>",);
    expect(msgs[0]?.content,).toContain("</output_style>",);
  });
});
