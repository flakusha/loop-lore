// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for the dynamic-context prompt section. */
import { describe, expect, test, } from "bun:test";
import type { AssembleContext, } from "../types";
import { dynamicContextSection, } from "./dynamic-context";

const ctx = {} as AssembleContext;

describe("dynamicContextSection", () => {
  test("always enabled", () => {
    expect(dynamicContextSection.enabled(ctx,),).toBe(true,);
  });

  test("build emits today's date as a user message", async () => {
    const out = await dynamicContextSection.build(ctx,);
    expect(out.length,).toBe(1,);
    expect(out[0]?.role,).toBe("user",);
    const today = new Date().toISOString().split("T", 1,)[0];
    expect(out[0]?.content as string,).toContain(`[Current date: ${today}`,);
  });
});
