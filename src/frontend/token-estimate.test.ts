// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import { estimateTokens, } from "./token-estimate";

describe("frontend estimateTokens", () => {
  it("mirrors the shared ~4 chars-per-token heuristic", () => {
    expect(estimateTokens("a".repeat(100,),),).toBe(25,);
    expect(estimateTokens("abc",),).toBe(1,);
    expect(estimateTokens("abcde",),).toBe(2,);
    expect(estimateTokens("",),).toBe(0,);
  });
});
